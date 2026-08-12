//! Dono único da migração do banco e do nome do arquivo.
//!
//! A migração roda aqui, no `setup()` do Tauri, e **não** no plugin sql. O motivo é
//! um defeito do `tauri-plugin-sql` 2.4.0 (`src/commands.rs::load`): a lista de
//! migrations sai do mapa compartilhado com `.remove()` *antes* de migrar. Se a
//! primeira tentativa falha, a lista já foi consumida e toda chamada seguinte
//! encontra `None` — conecta, não migra e **retorna sucesso**. Com as 4 janelas do
//! `tauri.conf.json` chamando `Database.load` na mesma URL no boot, a contenção no
//! SQLite fazia a primeira falhar e o app inteiro seguia em schema velho, com um
//! único WARN no log. A correção upstream ainda não existe (a branch `v2` do
//! plugins-workspace mantém o `.remove()`), por isso não há atalho por upgrade.
//!
//! O `setup()` roda dentro do `build()`, **depois** de as 4 janelas do
//! `tauri.conf.json` serem criadas (tauri 2.10.3, `app.rs::setup`: as janelas na
//! linha 2374, o hook do app na 2380). Isso não bastaria para haver corrida se
//! nada despachasse `invoke` antes de o event loop começar — e no Linux não
//! despacha. No Windows, sim: o wry bombeia a fila de mensagens enquanto espera
//! cada WebView2 nascer (`webview2_com::wait_with_pump`, wry 0.54.4
//! `webview2/mod.rs:363,414`), então o frontend da primeira janela chega a chamar
//! `get_db_bootstrap` enquanto a quarta ainda está sendo criada — antes de o
//! `setup()` ter migrado o que quer que seja.
//!
//! Por isso o state é registrado **no `Builder`**, antes de qualquer janela, já
//! existindo quando o invoke adiantado chega; e o comando é `async`, para esperar
//! o resultado da migração sem travar a thread principal, que é justamente quem
//! está migrando (comando async roda na async runtime — `tauri::ipc::mod.rs:329`).

use std::path::PathBuf;

use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::watch;

/// Migrations embutidas em tempo de compilação a partir de `src-tauri/migrations/`.
/// Os arquivos `.sql` são a única fonte da verdade: não há lista paralela a manter.
/// O checksum gravado é o SHA-384 do conteúdo do arquivo — o mesmo que o plugin
/// calculava —, então os bancos já migrados continuam válidos.
static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Nome do arquivo do banco. É a única decisão dev/produção do projeto: o frontend
/// e a API local consomem daqui em vez de repetir o `cfg!(debug_assertions)` /
/// `import.meta.env.DEV` — que podem divergir (`tauri build --debug`, por exemplo).
pub fn db_file_name() -> &'static str {
    if cfg!(debug_assertions) {
        "deskclock-dev.db"
    } else {
        "deskclock.db"
    }
}

/// Caminho absoluto do banco, replicando o que `tauri-plugin-sql` faz em
/// `wrapper.rs::connect` + `path_mapper`: `app_config_dir()` + nome do arquivo.
/// Divergir daqui migraria um arquivo e leria outro.
pub fn resolve_db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Não foi possível obter o diretório de configuração do app: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Não foi possível criar {}: {e}", dir.display()))?;
    Ok(dir.join(db_file_name()))
}

/// O que o frontend precisa saber para conectar. `url` mantém a forma relativa que
/// o plugin espera em `Database.load` — ele aplica o mesmo `path_mapper`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbBootstrap {
    pub url: String,
    pub expected_version: i64,
}

/// Resultado da migração do boot, guardado para o frontend consultar.
///
/// Nasce vazio no `Builder` e é preenchido uma vez, no `setup()`. Quem consulta
/// antes disso espera — ver o comentário de topo do módulo.
pub struct DbBootstrapState {
    tx: watch::Sender<Option<Result<DbBootstrap, String>>>,
}

impl Default for DbBootstrapState {
    fn default() -> Self {
        Self {
            tx: watch::channel(None).0,
        }
    }
}

impl DbBootstrapState {
    /// Publica o resultado da migração e libera quem estiver esperando.
    pub fn fulfill(&self, result: Result<DbBootstrap, String>) {
        self.tx.send_replace(Some(result));
    }

    /// Devolve o resultado da migração, esperando se o `setup()` ainda não chegou
    /// lá. `wait_for` testa o valor corrente antes de dormir: no caso comum — boot
    /// terminado — não há espera nenhuma.
    async fn get(&self) -> Result<DbBootstrap, String> {
        let mut rx = self.tx.subscribe();
        let value = rx.wait_for(|v| v.is_some()).await.map_err(|_| {
            "O boot do banco de dados terminou sem publicar um resultado.".to_string()
        })?;
        (*value)
            .clone()
            .expect("wait_for só devolve com Some publicado")
    }
}

/// Aplica as migrations pendentes. Chamado uma vez, no `setup()`.
pub fn migrate<R: Runtime>(app: &AppHandle<R>) -> Result<DbBootstrap, String> {
    let path = resolve_db_path(app)?;

    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .busy_timeout(std::time::Duration::from_secs(5));

    tauri::async_runtime::block_on(async move {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .map_err(|e| format!("Falha ao abrir {}: {e}", path.display()))?;

        let result = MIGRATOR
            .run(&pool)
            .await
            .map_err(|e| format!("Falha ao aplicar as migrations: {e}"));

        // A conexão da migração não é reaproveitada: quem consulta é o plugin, com
        // o pool dele. Fechar aqui evita disputar o lock com as janelas.
        pool.close().await;
        result?;

        Ok(DbBootstrap {
            url: format!("sqlite:{}", db_file_name()),
            expected_version: expected_version(),
        })
    })
}

/// Maior versão entre as migrations embutidas — o schema que este binário espera.
fn expected_version() -> i64 {
    MIGRATOR.iter().map(|m| m.version).max().unwrap_or(0)
}

/// URL do banco e versão esperada do schema. Devolve erro quando a migração do boot
/// falhou, para que nenhuma tela rode contra schema velho.
#[tauri::command]
pub async fn get_db_bootstrap(state: State<'_, DbBootstrapState>) -> Result<DbBootstrap, String> {
    state.get().await
}

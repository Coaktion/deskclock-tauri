use crate::api::routes::build_router;
use crate::api::state::ApiState;
use serde::Serialize;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

pub const DEFAULT_PORT: u16 = 27420;
pub const CONFIG_KEY_ENABLED: &str = "localApiEnabled";
pub const CONFIG_KEY_PORT: &str = "localApiPort";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub error: Option<String>,
}

/// Estado compartilhado do servidor da API local.
/// Armazenado como tauri::State para que os commands possam controlar o ciclo de vida.
#[derive(Default)]
pub struct ApiServerState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    handle: Option<RunningServer>,
    last_error: Option<String>,
}

struct RunningServer {
    port: u16,
    cancel: CancellationToken,
    join: tokio::task::JoinHandle<()>,
}

impl ApiServerState {
    pub fn status(&self) -> ServerStatus {
        let g = self.inner.lock().unwrap();
        match &g.handle {
            Some(h) => ServerStatus {
                running: true,
                port: Some(h.port),
                error: None,
            },
            None => ServerStatus {
                running: false,
                port: None,
                error: g.last_error.clone(),
            },
        }
    }

    fn set_error(&self, msg: String) {
        let mut g = self.inner.lock().unwrap();
        g.last_error = Some(msg);
    }

    fn clear_error(&self) {
        let mut g = self.inner.lock().unwrap();
        g.last_error = None;
    }

    fn take_handle(&self) -> Option<RunningServer> {
        let mut g = self.inner.lock().unwrap();
        g.handle.take()
    }

    fn set_handle(&self, h: RunningServer) {
        let mut g = self.inner.lock().unwrap();
        g.handle = Some(h);
    }

    fn is_running(&self) -> bool {
        let g = self.inner.lock().unwrap();
        g.handle.is_some()
    }
}

fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Não foi possível obter o diretório do app: {e}"))?;
    let db_file = if cfg!(debug_assertions) { "deskclock-dev.db" } else { "deskclock.db" };
    Ok(dir.join(db_file))
}

/// Lê a configuração `localApiEnabled` do SQLite (valor JSON).
/// Retorna `false` por padrão (API desativada até o usuário habilitar).
pub fn read_enabled(db_path: &Path) -> bool {
    let Ok(db) = crate::api::db::Db::open(db_path) else {
        return false;
    };
    match db.get_config_json(CONFIG_KEY_ENABLED) {
        Ok(Some(v)) => serde_json::from_str::<bool>(&v).unwrap_or(false),
        _ => false,
    }
}

pub fn read_port(db_path: &Path) -> u16 {
    let Ok(db) = crate::api::db::Db::open(db_path) else {
        return DEFAULT_PORT;
    };
    match db.get_config_json(CONFIG_KEY_PORT) {
        Ok(Some(v)) => serde_json::from_str::<u16>(&v).unwrap_or(DEFAULT_PORT),
        _ => DEFAULT_PORT,
    }
}

/// Inicia o servidor REST na porta indicada. Se já estiver rodando, para antes.
pub async fn start(app: AppHandle, port: u16) -> Result<u16, String> {
    let state: tauri::State<Arc<ApiServerState>> = app.state();
    let server_state = state.inner().clone();

    if server_state.is_running() {
        stop_internal(&server_state).await;
    }

    let db_path = resolve_db_path(&app)?;
    if !db_path.exists() {
        let msg = format!("Banco não encontrado em {}", db_path.display());
        server_state.set_error(msg.clone());
        return Err(msg);
    }

    let api_state = Arc::new(ApiState::new(db_path, app.clone()));
    let router = build_router(api_state);

    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        let msg = format!("Falha ao vincular porta {port}: {e}");
        server_state.set_error(msg.clone());
        msg
    })?;

    let cancel = CancellationToken::new();
    let cancel_child = cancel.clone();

    let join = tokio::spawn(async move {
        let server = axum::serve(listener, router.into_make_service())
            .with_graceful_shutdown(async move {
                cancel_child.cancelled().await;
            });
        if let Err(e) = server.await {
            log::error!("API local encerrou com erro: {e}");
        }
    });

    server_state.clear_error();
    server_state.set_handle(RunningServer {
        port,
        cancel,
        join,
    });
    log::info!("API local escutando em http://127.0.0.1:{port}");
    Ok(port)
}

async fn stop_internal(state: &ApiServerState) {
    if let Some(h) = state.take_handle() {
        h.cancel.cancel();
        let _ = h.join.await;
    }
}

pub async fn stop(app: AppHandle) -> Result<(), String> {
    let state: tauri::State<Arc<ApiServerState>> = app.state();
    stop_internal(state.inner()).await;
    Ok(())
}

pub fn status(app: &AppHandle) -> ServerStatus {
    let state: tauri::State<Arc<ApiServerState>> = app.state();
    state.inner().status()
}

/// Inicia a API automaticamente no startup se `localApiEnabled` for true.
pub fn start_on_boot(app: AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(db_path) = resolve_db_path(&handle) else {
            return;
        };
        if !read_enabled(&db_path) {
            log::info!("API local desativada nas configurações — não iniciando.");
            return;
        }
        let port = read_port(&db_path);
        if let Err(e) = start(handle.clone(), port).await {
            log::warn!("API local não iniciou: {e}");
        }
    });
}

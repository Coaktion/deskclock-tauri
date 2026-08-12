//! Snapshot do banco e envio ao Google Drive, num comando só.
//!
//! O comando é **estreito de propósito**: ele não recebe caminho de arquivo nem
//! URL. Um `upload_file(path, url)` genérico seria um primitivo de exfiltração —
//! qualquer JS da webview mandaria qualquer arquivo para qualquer lugar. Aqui o
//! que atravessa a fronteira é o token, a pasta de destino e o nome do arquivo;
//! o que se envia é sempre o banco desta instalação.
//!
//! O que **não** está aqui, e é decisão registrada em
//! `docs/specs/backup-google-drive.md`: a pasta do Drive, a poda dos backups
//! antigos e a regra de vencimento vivem no TypeScript, onde há teste. Este
//! arquivo é a parte que só o Rust alcança.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::database;

const UPLOAD_ENDPOINT: &str =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";

/// Nome fixo, e não um por tentativa: um crash entre o `VACUUM INTO` e o envio
/// deixa no máximo **um** arquivo órfão no cache, sobrescrito na execução
/// seguinte. Com nome único por execução, cada falha deixaria um resto que
/// ninguém coleta.
const SNAPSHOT_FILE_NAME: &str = "backup-snapshot.db";

/// Gera um snapshot consistente do banco, apaga dele as credenciais e envia o
/// arquivo para uma pasta do Google Drive. Devolve o `fileId` criado.
///
/// `secret_keys` vem do frontend, e não está cravado aqui, porque a lista tem de
/// morar ao lado do `AppConfig` — é lá que uma integração nova acrescenta o
/// token dela. Cravada no Rust, ela envelheceria calada, e o primeiro backup
/// depois da próxima integração levaria o token novo para a nuvem.
#[tauri::command]
pub async fn backup_db_to_drive(
    app: AppHandle,
    access_token: String,
    folder_id: String,
    file_name: String,
    secret_keys: Vec<String>,
) -> Result<String, String> {
    let db_path = database::resolve_db_path(&app)?;
    let snapshot_path = snapshot_path(&app)?;

    // O trabalho de SQLite é bloqueante e não pode rodar na thread do runtime
    // async — ele seguraria o event loop pelo tempo do VACUUM.
    let snapshot = {
        let snapshot_path = snapshot_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            create_sanitized_snapshot(&db_path, &snapshot_path, &secret_keys)
        })
        .await
        .map_err(|e| format!("Falha ao gerar o snapshot do banco: {e}"))?
    };

    // O snapshot é temporário em qualquer desfecho: sucesso, recusa do Drive ou
    // erro de rede. Ele carrega o banco inteiro, e deixá-lo no cache duplicaria
    // os dados no disco sem que nada os limpasse depois.
    let result = match snapshot {
        Ok(()) => upload_to_drive(&snapshot_path, &access_token, &folder_id, &file_name).await,
        Err(e) => Err(e),
    };
    let _ = std::fs::remove_file(&snapshot_path);
    result
}

fn snapshot_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Não foi possível obter o diretório de cache do app: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Não foi possível criar {}: {e}", dir.display()))?;
    Ok(dir.join(SNAPSHOT_FILE_NAME))
}

/// `VACUUM INTO` em vez de copiar o arquivo: o banco roda em modo WAL com quatro
/// janelas conectadas, e uma cópia crua pega páginas de um instante e o WAL de
/// outro — o backup sobe corrompido e só se descobre no dia em que ele é a
/// última esperança. O `VACUUM INTO` lê numa transação e escreve um arquivo
/// íntegro, já compactado.
fn create_sanitized_snapshot(
    db_path: &Path,
    snapshot_path: &Path,
    secret_keys: &[String],
) -> Result<(), String> {
    // `VACUUM INTO` recusa destino existente, e o arquivo pode ter sobrado de uma
    // execução interrompida.
    if snapshot_path.exists() {
        std::fs::remove_file(snapshot_path)
            .map_err(|e| format!("Não foi possível limpar o snapshot anterior: {e}"))?;
    }

    let destination = snapshot_path.to_string_lossy().to_string();
    let source = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Não foi possível abrir o banco: {e}"))?;
    source
        .execute("VACUUM INTO ?1", [&destination])
        .map_err(|e| format!("Não foi possível gerar o snapshot: {e}"))?;
    drop(source);

    purge_secrets(snapshot_path, secret_keys)
}

/// Apaga do snapshot as chaves de credencial e **compacta de novo**.
///
/// O segundo `VACUUM` não é zelo: o `DELETE` desliga a linha, mas o valor
/// continua legível nas páginas livres do arquivo. Sem ele, o token viajaria
/// para o Drive dentro de um arquivo que se afirma limpo — que é pior do que não
/// ter expurgado nada, porque ninguém iria conferir.
fn purge_secrets(snapshot_path: &Path, secret_keys: &[String]) -> Result<(), String> {
    if secret_keys.is_empty() {
        return Ok(());
    }

    let conn = rusqlite::Connection::open(snapshot_path)
        .map_err(|e| format!("Não foi possível abrir o snapshot: {e}"))?;

    let placeholders = vec!["?"; secret_keys.len()].join(",");
    let sql = format!("DELETE FROM config WHERE key IN ({placeholders})");
    conn.execute(&sql, rusqlite::params_from_iter(secret_keys.iter()))
        .map_err(|e| format!("Não foi possível remover as credenciais do snapshot: {e}"))?;

    conn.execute_batch("VACUUM")
        .map_err(|e| format!("Não foi possível compactar o snapshot: {e}"))?;

    Ok(())
}

/// Upload `multipart/related` — metadados e conteúdo numa requisição só. O corpo
/// é montado à mão porque `multipart/related` não é `form-data`: a feature
/// `multipart` do reqwest resolve a outra, e não serve aqui.
async fn upload_to_drive(
    snapshot_path: &Path,
    access_token: &str,
    folder_id: &str,
    file_name: &str,
) -> Result<String, String> {
    let bytes = std::fs::read(snapshot_path)
        .map_err(|e| format!("Não foi possível ler o snapshot: {e}"))?;

    let boundary = format!("deskclock-{}", uuid::Uuid::new_v4());
    let metadata = serde_json::json!({
        "name": file_name,
        "parents": [folder_id],
    });

    let mut body: Vec<u8> = Vec::with_capacity(bytes.len() + 512);
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.to_string().as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let res = reqwest::Client::new()
        .post(UPLOAD_ENDPOINT)
        .header("Authorization", format!("Bearer {access_token}"))
        .header(
            "Content-Type",
            format!("multipart/related; boundary={boundary}"),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Falha ao enviar o backup: {e}"))?;

    let status = res.status();
    let payload: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);

    if !status.is_success() {
        // O código volta no texto porque é o 403 que o frontend precisa
        // reconhecer: é ele que significa "o token não tem o escopo do Drive",
        // e a saída é reconectar o Google — não tentar de novo.
        let detail = payload
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .unwrap_or("resposta sem detalhe");
        return Err(format!("Drive respondeu {}: {detail}", status.as_u16()));
    }

    payload
        .get("id")
        .and_then(|id| id.as_str())
        .map(|id| id.to_string())
        .ok_or_else(|| "Drive aceitou o envio mas não devolveu o id do arquivo.".to_string())
}

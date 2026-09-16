use crate::api;
use crate::api::bridge::Bridge;
use crate::api::server::ServerStatus;
use std::sync::Arc;

#[tauri::command]
pub async fn start_local_api(app: tauri::AppHandle, port: Option<u16>) -> Result<u16, String> {
    let port = port.unwrap_or(api::server::DEFAULT_PORT);
    api::server::start(app, port).await
}

#[tauri::command]
pub async fn stop_local_api(app: tauri::AppHandle) -> Result<(), String> {
    api::server::stop(app).await
}

#[tauri::command]
pub fn get_local_api_status(app: tauri::AppHandle) -> ServerStatus {
    api::server::status(&app)
}

/// A janela principal entrega aqui a resposta de uma requisição da ponte.
#[tauri::command]
pub fn local_api_respond(
    bridge: tauri::State<'_, Arc<Bridge>>,
    id: String,
    status: u16,
    body: serde_json::Value,
) {
    // `false` só significa que a requisição já expirou; não há a quem avisar.
    let _ = bridge.respond(&id, status, body);
}

/// A janela principal avisa que já escuta `local-api:request`.
#[tauri::command]
pub fn local_api_bridge_ready(bridge: tauri::State<'_, Arc<Bridge>>) {
    bridge.mark_ready();
}

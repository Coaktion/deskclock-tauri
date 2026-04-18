use crate::api;
use crate::api::server::ServerStatus;

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

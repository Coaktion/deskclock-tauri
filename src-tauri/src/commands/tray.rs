use tauri::Manager;

#[tauri::command]
pub fn update_tray_tooltip(app: tauri::AppHandle, text: Option<String>) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(text.as_deref()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_tray_icon(app: tauri::AppHandle, status: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        let icon_name = match status.as_str() {
            "running" => "running.png",
            "paused" => "paused.png",
            _ => "idle.png",
        };

        // Resolve o caminho do ícone a partir da pasta de recursos do Tauri
        let resource_path = app
            .path()
            .resolve(
                format!("icons/tray/{}", icon_name),
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| e.to_string())?;

        let icon = tauri::image::Image::from_path(resource_path).map_err(|e| e.to_string())?;
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

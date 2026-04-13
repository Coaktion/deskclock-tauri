#[tauri::command]
pub fn update_tray_tooltip(app: tauri::AppHandle, text: Option<String>) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(text.as_deref()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

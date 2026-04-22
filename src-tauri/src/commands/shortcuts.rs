use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(serde::Deserialize)]
pub struct ShortcutEntry {
    pub action: String,
    pub accelerator: String,
}

#[tauri::command]
pub fn update_shortcuts(app: tauri::AppHandle, shortcuts: Vec<ShortcutEntry>) -> Result<Vec<String>, String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    let mut failed: Vec<String> = Vec::new();

    for entry in shortcuts {
        if entry.accelerator.is_empty() {
            continue;
        }
        let action = entry.action.clone();
        let app_handle = app.clone();
        if let Err(e) = app.global_shortcut().on_shortcut(
            entry.accelerator.as_str(),
            move |_, _, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                match action.as_str() {
                    "toggle-task" => {
                        let _ = app_handle.emit("shortcut:toggle-task", ());
                    }
                    "stop-task" => {
                        let _ = app_handle.emit("shortcut:stop-task", ());
                    }
                    "toggle-overlay" => {
                        if let Some(w) = app_handle.get_webview_window("overlay") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                            }
                        }
                    }
                    "toggle-window" => {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "toggle-command-palette" => {
                        if let Some(w) = app_handle.get_webview_window("command-palette") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                // Posicionamento delegado ao main window via evento —
                                // centerOnWorkArea respeita o config manual do usuário.
                                let _ = app_handle.emit("shortcut:show-command-palette", ());
                            }
                        }
                    }
                    _ => {}
                }
            },
        ) {
            eprintln!("Failed to register shortcut '{}': {}", entry.accelerator, e);
            failed.push(entry.accelerator);
        }
    }
    Ok(failed)
}

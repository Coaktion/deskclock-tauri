use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Retorna o identificador de plataforma compatível com a convenção Node.js/Electron.
/// Valores: "win32" | "darwin" | "linux"
#[tauri::command]
fn get_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

/// Abre uma URL no navegador padrão do sistema operacional.
/// Substitui `tauri-plugin-opener` para evitar problemas de escopo de permissão.
#[tauri::command]
fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // PowerShell trata URLs com '&' corretamente, diferente de cmd /c start
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &format!("Start-Process \"{}\"", url.replace('"', "\\\"")),
            ])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Abre um arquivo ou pasta no explorador de arquivos padrão do sistema.
#[tauri::command]
fn open_in_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Inicia um servidor HTTP temporário em uma porta aleatória para capturar o
/// redirect do OAuth. Ao receber o callback, emite o evento
/// "oauth_callback_received" com o authorization code para o frontend.
#[tauri::command]
fn start_oauth_server(app: tauri::AppHandle) -> Result<u16, String> {
    let listener =
        std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            use std::io::{Read, Write};
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);

            let success_html = concat!(
                "HTTP/1.1 200 OK\r\n",
                "Content-Type: text/html; charset=utf-8\r\n",
                "Connection: close\r\n\r\n",
                "<!DOCTYPE html><html><head><meta charset='utf-8'>",
                "<style>body{font-family:sans-serif;text-align:center;padding:3rem;background:#111;color:#eee}</style>",
                "</head><body><h2>✅ Autorização concluída!</h2>",
                "<p>Pode fechar esta aba e voltar ao DeskClock.</p></body></html>"
            );
            let _ = stream.write_all(success_html.as_bytes());

            if let Some(code) = extract_oauth_code(&req) {
                let _ = app.emit("oauth_callback_received", code);
            }
        }
    });

    Ok(port)
}

fn extract_oauth_code(request: &str) -> Option<String> {
    // Primeira linha: "GET /callback?code=XXXX&scope=... HTTP/1.1"
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        let key = kv.next()?;
        let value = kv.next()?;
        if key == "code" {
            return Some(value.to_string());
        }
    }
    None
}

#[tauri::command]
fn save_file(path: String, content: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_tray_tooltip(app: tauri::AppHandle, text: Option<String>) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(text.as_deref()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct ShortcutEntry {
    action: String,
    accelerator: String,
}

#[tauri::command]
fn update_shortcuts(app: tauri::AppHandle, shortcuts: Vec<ShortcutEntry>) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

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
                    _ => {}
                }
            },
        ) {
            eprintln!("Failed to register shortcut '{}': {}", entry.accelerator, e);
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "tasks",
            sql: include_str!("../migrations/002_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "planned_tasks",
            sql: include_str!("../migrations/003_planned_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "export_profiles",
            sql: include_str!("../migrations/004_export_profiles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "config",
            sql: include_str!("../migrations/005_config.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "task_sheets_sent",
            sql: include_str!("../migrations/006_task_sheets_sent.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let show = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let toggle_task = MenuItem::with_id(app, "toggle-task", "Iniciar / Pausar tarefa", true, None::<&str>)?;
            let stop_task = MenuItem::with_id(app, "stop-task", "Parar tarefa", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sep, &toggle_task, &stop_task, &sep, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DeskClock")
                .menu(&menu)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Posiciona a janela próxima ao ícone do tray
                                if let Ok(Some(monitor)) = window.current_monitor().or_else(|_| window.primary_monitor()) {
                                    let screen_h = monitor.size().height as i32;
                                    let screen_w = monitor.size().width as i32;
                                    let win_size = window.outer_size().unwrap_or_default();
                                    let win_w = win_size.width as i32;
                                    let win_h = win_size.height as i32;

                                    let click_x = position.x as i32;
                                    let click_y = position.y as i32;

                                    let x = (click_x - win_w / 2).clamp(0, screen_w - win_w);
                                    // Detecta se taskbar está na metade inferior ou superior da tela
                                    let y = if click_y > screen_h / 2 {
                                        (click_y - win_h - 8).max(0)
                                    } else {
                                        (click_y + 8).min(screen_h - win_h)
                                    };

                                    let _ = window.set_position(tauri::Position::Physical(
                                        PhysicalPosition::new(x, y),
                                    ));
                                }
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle-task" => {
                        let _ = app.emit("shortcut:toggle-task", ());
                    }
                    "stop-task" => {
                        let _ = app.emit("shortcut:stop-task", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deskclock.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            save_file,
            update_tray_tooltip,
            update_shortcuts,
            start_oauth_server,
            get_platform,
            open_in_browser,
            open_in_file_manager,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

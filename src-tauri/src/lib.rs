mod commands;
mod migrations;
mod tray;

use tauri::Manager;
use commands::{
    check_for_update, download_and_install_update, get_platform, open_in_browser,
    open_in_file_manager, relaunch_app, save_file, start_oauth_server, update_shortcuts,
    update_tray_icon, update_tray_tooltip,
};
use tauri_plugin_autostart::MacosLauncher;

/// Re-afirma HWND_TOPMOST para todas as janelas overlay a cada 200ms.
///
/// Necessário no Windows porque a taskbar compete pelo z-order e o caminho
/// IPC (JS → Tauri) chega tarde demais para vencer a disputa. Chamando
/// `set_always_on_top` diretamente no processo nativo, sem roundtrip IPC,
/// o flag HWND_TOPMOST é restaurado antes que a taskbar consiga se sobrepor.
fn keep_overlays_topmost(handle: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        for label in ["overlay", "toast", "welcome"] {
            if let Some(w) = handle.get_webview_window(label) {
                w.set_always_on_top(true).ok();
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            tray::setup_tray(app)?;

            // Mantém todas as janelas overlay sempre acima da taskbar do Windows.
            // O JS setAlwaysOnTop passa pela bridge IPC e chega tarde demais quando
            // a taskbar disputa o z-order. Esta thread chama set_always_on_top
            // direto no processo nativo, sem IPC, garantindo que HWND_TOPMOST
            // seja re-afirmado continuamente. Uma única thread cobre overlay,
            // toast e welcome — janelas ausentes são ignoradas silenciosamente.
            keep_overlays_topmost(app.handle().clone());

            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deskclock.db", migrations::get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            save_file,
            update_tray_tooltip,
            update_tray_icon,
            update_shortcuts,
            start_oauth_server,
            get_platform,
            open_in_browser,
            open_in_file_manager,
            check_for_update,
            download_and_install_update,
            relaunch_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

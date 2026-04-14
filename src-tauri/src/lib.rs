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

            // Mantém o overlay sempre acima da taskbar do Windows.
            // O JS setAlwaysOnTop passa pela bridge IPC e chega tarde demais quando
            // a taskbar disputa o z-order. Esta thread chama set_always_on_top
            // direto no processo nativo, sem IPC, garantindo que HWND_TOPMOST
            // seja re-afirmado a cada 500ms antes que a taskbar consiga se sobrepor.
            if let Some(overlay) = app.get_webview_window("overlay") {
                std::thread::spawn(move || loop {
                    overlay.set_always_on_top(true).ok();
                    std::thread::sleep(std::time::Duration::from_millis(500));
                });
            }

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

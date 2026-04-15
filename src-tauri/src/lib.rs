mod commands;
mod migrations;
mod tray;

use std::sync::OnceLock;
use tauri::Manager;
use commands::{
    check_for_update, download_and_install_update, get_platform, open_in_browser,
    open_in_file_manager, relaunch_app, save_file, start_oauth_server, update_shortcuts,
    update_tray_icon, update_tray_tooltip,
};
use tauri_plugin_autostart::MacosLauncher;

// Compartilha o AppHandle com o callback do WinEvent hook (Windows-only).
// OnceLock garante inicialização única e acesso thread-safe sem Mutex.
#[cfg(target_os = "windows")]
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Callback invocado pelo sistema quando qualquer janela torna-se foreground
/// (EVENT_SYSTEM_FOREGROUND). Re-afirma HWND_TOPMOST para os overlays via
/// SetWindowPos síncrono — sem polling, sem SWP_ASYNCWINDOWPOS.
#[cfg(target_os = "windows")]
unsafe extern "system" fn win_event_proc(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    _event: u32,
    _hwnd: windows::Win32::Foundation::HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOACTIVATE, SWP_NOSIZE,
    };
    let Some(handle) = APP_HANDLE.get() else { return };
    for label in ["overlay", "toast", "welcome"] {
        let Some(w) = handle.get_webview_window(label) else { continue };
        if !w.is_visible().unwrap_or(false) { continue; }
        let Ok(hwnd) = w.hwnd() else { continue };
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

/// Garante que os overlays permanecem acima da taskbar do Windows.
///
/// No Windows: registra um WinEvent hook para EVENT_SYSTEM_FOREGROUND.
/// Quando qualquer janela (incluindo a taskbar) torna-se foreground, o callback
/// re-afirma HWND_TOPMOST imediatamente via SetWindowPos síncrono. A thread
/// dedicada só pumpa a fila de mensagens — zero overhead em idle.
///
/// Em outras plataformas: fallback com polling de 200ms via set_always_on_top.
fn keep_overlays_topmost(handle: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        APP_HANDLE.set(handle).ok();
        std::thread::spawn(|| unsafe {
            use windows::Win32::UI::Accessibility::SetWinEventHook;
            use windows::Win32::UI::WindowsAndMessaging::{
                EVENT_SYSTEM_FOREGROUND, GetMessageW, MSG, WINEVENT_OUTOFCONTEXT,
            };
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(win_event_proc),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            if hook.0.is_null() { return; }
            let _hook = hook; // mantém o hook vivo; drop chama UnhookWinEvent automaticamente
            let mut msg = MSG::default();
            // Loop de mensagens necessário para que WINEVENT_OUTOFCONTEXT
            // entregue os callbacks nesta thread
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
        });
    }
    #[cfg(not(target_os = "windows"))]
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

mod api;
mod commands;
mod migrations;
mod tray;

#[cfg(target_os = "windows")]
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

// ── Estados pendentes de deep link ──────────────────────────────────────────

struct PendingDeepLinkPage(Mutex<Option<String>>);

#[tauri::command]
fn get_pending_deep_link_page(state: tauri::State<PendingDeepLinkPage>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeepLinkStartTaskParams {
    name: Option<String>,
    project_name: Option<String>,
    category_name: Option<String>,
    billable: bool,
}

struct PendingStartTask(Mutex<Option<DeepLinkStartTaskParams>>);

#[tauri::command]
fn get_pending_start_task(state: tauri::State<PendingStartTask>) -> Option<DeepLinkStartTaskParams> {
    state.0.lock().unwrap().take()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeepLinkRetroactivePrefill {
    date: Option<String>,
    name: Option<String>,
    project_name: Option<String>,
    category_name: Option<String>,
    start: Option<String>,
    end: Option<String>,
}

struct PendingRetroactivePrefill(Mutex<Option<DeepLinkRetroactivePrefill>>);

#[tauri::command]
fn get_pending_retroactive_prefill(
    state: tauri::State<PendingRetroactivePrefill>,
) -> Option<DeepLinkRetroactivePrefill> {
    state.0.lock().unwrap().take()
}
use tauri::{Emitter, Manager};
use commands::{
    check_for_update, download_and_install_update, get_bearer_json, get_display_server,
    get_local_api_status, get_platform, log_frontend_error, open_in_browser, open_in_file_manager,
    post_form_json, relaunch_app, save_file, start_local_api, start_oauth_server, stop_local_api,
    update_shortcuts, update_tray_icon, update_tray_tooltip,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_deep_link::DeepLinkExt;

// Compartilha o AppHandle com o callback do WinEvent hook (Windows-only).
// OnceLock garante inicialização única e acesso thread-safe sem Mutex.
#[cfg(target_os = "windows")]
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

// ID único para o timer de re-afirmação pós-Win+D.
#[cfg(target_os = "windows")]
const TIMER_ID_TOPMOST: usize = 1001;

/// Chamado pelo timer 100 ms após detectar Win+D / "Mostrar Área de Trabalho".
/// A barra de tarefas reasserta HWND_TOPMOST depois do EVENT_SYSTEM_FOREGROUND,
/// então re-afirmamos os overlays com um pequeno atraso para ganhar o race condition.
#[cfg(target_os = "windows")]
unsafe extern "system" fn timer_topmost_proc(
    _hwnd: windows::Win32::Foundation::HWND,
    _msg: u32,
    _id: usize,
    _time: u32,
) {
    use windows::Win32::UI::WindowsAndMessaging::{
        KillTimer, SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOACTIVATE, SWP_NOSIZE,
    };
    let _ = KillTimer(None, TIMER_ID_TOPMOST);
    let Some(handle) = APP_HANDLE.get() else { return };
    for label in ["overlay-compact", "overlay-popup", "toast", "command-palette"] {
        let Some(w) = handle.get_webview_window(label) else { continue };
        if !w.is_visible().unwrap_or(false) { continue; }
        let Ok(hwnd) = w.hwnd() else { continue };
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

/// Callback invocado pelo sistema quando qualquer janela torna-se foreground
/// (EVENT_SYSTEM_FOREGROUND). Re-afirma HWND_TOPMOST para os overlays via
/// SetWindowPos síncrono. Quando o foreground é a área de trabalho (Win+D ou
/// botão "Mostrar Área de Trabalho"), agenda um timer de 100 ms para re-afirmar
/// depois que a taskbar terminar de reassertar sua própria posição TOPMOST.
#[cfg(target_os = "windows")]
unsafe extern "system" fn win_event_proc(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    _event: u32,
    hwnd: windows::Win32::Foundation::HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, SetTimer, SetWindowPos,
        HWND_TOPMOST, SWP_NOMOVE, SWP_NOACTIVATE, SWP_NOSIZE,
    };
    let Some(handle) = APP_HANDLE.get() else { return };
    for label in ["overlay-compact", "overlay-popup", "toast", "command-palette"] {
        let Some(w) = handle.get_webview_window(label) else { continue };
        if !w.is_visible().unwrap_or(false) { continue; }
        let Ok(wnd) = w.hwnd() else { continue };
        let _ = SetWindowPos(wnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    // Detecta Win+D / "Mostrar Área de Trabalho": o foreground passa a ser
    // WorkerW (desktop com ícones) ou Progman (shell do Windows).
    // A taskbar reasserta HWND_TOPMOST após este callback, por isso agendamos
    // um timer para ganhar o race condition com um atraso de 100 ms.
    if !hwnd.is_invalid() {
        let mut class_buf = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut class_buf);
        if len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
            if matches!(class_name.as_str(), "WorkerW" | "Progman") {
                SetTimer(None, TIMER_ID_TOPMOST, 100, Some(timer_topmost_proc));
            }
        }
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
            // DispatchMessageW é necessário para que WM_TIMER (usado pelo timer
            // de re-afirmação pós-Win+D) seja entregue ao timer_topmost_proc.
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    std::thread::spawn(move || loop {
        for label in ["overlay-compact", "overlay-popup", "toast", "command-palette"] {
            if let Some(w) = handle.get_webview_window(label) {
                if w.is_visible().unwrap_or(false) {
                    w.set_always_on_top(true).ok();
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    });
}

const VALID_PAGES: &[&str] = &[
    "tasks",
    "retroactive",
    "planning",
    "history",
    "data",
    "integrations",
    "settings",
];

fn url_decode(s: &str) -> String {
    let s = s.replace('+', " ");
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h1 = (bytes[i + 1] as char).to_digit(16);
            let h2 = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h1), Some(h2)) = (h1, h2) {
                out.push(((h1 << 4) | h2) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(query: &str) -> HashMap<String, String> {
    if query.is_empty() {
        return HashMap::new();
    }
    query
        .split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            let v = if v.is_empty() { return None } else { v };
            Some((url_decode(k), url_decode(v)))
        })
        .collect()
}

fn bring_main_to_front(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn set_pending_page(app: &tauri::AppHandle, page: &str) {
    if let Some(state) = app.try_state::<PendingDeepLinkPage>() {
        *state.0.lock().unwrap() = Some(page.to_string());
    }
}

fn navigate_to(app: &tauri::AppHandle, page: &str) {
    set_pending_page(app, page);
    let _ = app.emit("deeplink:navigate", serde_json::json!({ "page": page }));
}

fn handle_deep_link(app: &tauri::AppHandle, raw: &str) {
    let Some(without_scheme) = raw.strip_prefix("deskclock://") else {
        log::warn!("Deep link ignorado — esquema inesperado: {raw}");
        return;
    };

    let (path_part, query_part) = without_scheme.split_once('?').unwrap_or((without_scheme, ""));
    let (action, sub_path) = path_part.split_once('/').unwrap_or((path_part, ""));
    let sub_path = sub_path.trim_end_matches('/');
    let params = parse_query(query_part);

    match action {
        "navigate" => {
            if !VALID_PAGES.contains(&sub_path) {
                log::warn!("Deep link navigate: página desconhecida '{sub_path}'");
                return;
            }
            navigate_to(app, sub_path);
            bring_main_to_front(app);
            log::info!("Deep link: navegando para '{sub_path}'");
        }
        "task" => match sub_path {
            "start" => {
                let task_params = DeepLinkStartTaskParams {
                    name: params.get("name").cloned(),
                    project_name: params.get("project").cloned(),
                    category_name: params.get("category").cloned(),
                    billable: params.get("billable").map(|v| v != "false").unwrap_or(true),
                };
                if let Some(state) = app.try_state::<PendingStartTask>() {
                    *state.0.lock().unwrap() = Some(task_params.clone());
                }
                let _ = app.emit("deeplink:start-task", &task_params);
                navigate_to(app, "tasks");
                bring_main_to_front(app);
                log::info!(
                    "Deep link: iniciando tarefa '{}'",
                    task_params.name.as_deref().unwrap_or("(sem nome)")
                );
            }
            _ => log::warn!("Deep link task: ação desconhecida '{sub_path}'"),
        },
        "retroactive" => {
            navigate_to(app, "retroactive");
            if !params.is_empty() {
                let prefill = DeepLinkRetroactivePrefill {
                    date: params.get("date").cloned(),
                    name: params.get("name").cloned(),
                    project_name: params.get("project").cloned(),
                    category_name: params.get("category").cloned(),
                    start: params.get("start").cloned(),
                    end: params.get("end").cloned(),
                };
                if let Some(state) = app.try_state::<PendingRetroactivePrefill>() {
                    *state.0.lock().unwrap() = Some(prefill.clone());
                }
                let _ = app.emit("deeplink:retroactive-prefill", &prefill);
            }
            bring_main_to_front(app);
            log::info!("Deep link: lançamento retroativo");
        }
        _ => log::warn!("Deep link: ação desconhecida '{action}'"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Log habilitado também em release (nível Warn) — os targets padrão do
            // plugin incluem o LogDir, então falhas de produção (ex.: carga do banco/
            // migrations) passam a ser persistidas em arquivo em vez de invisíveis.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .build(),
            )?;

            tray::setup_tray(app)?;
            keep_overlays_topmost(app.handle().clone());

            app.manage(Arc::new(api::ApiServerState::default()));
            app.manage(PendingDeepLinkPage(Mutex::new(None)));
            app.manage(PendingStartTask(Mutex::new(None)));
            app.manage(PendingRetroactivePrefill(Mutex::new(None)));
            api::server::start_on_boot(app.handle().clone());

            if let Err(e) = app.deep_link().register("deskclock") {
                log::warn!("Falha ao registrar esquema deep link: {e}");
            }

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&app_handle, &url.to_string());
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    if cfg!(debug_assertions) { "sqlite:deskclock-dev.db" } else { "sqlite:deskclock.db" },
                    migrations::get_migrations(),
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            save_file,
            update_tray_tooltip,
            update_tray_icon,
            update_shortcuts,
            start_oauth_server,
            post_form_json,
            get_bearer_json,
            get_platform,
            get_display_server,
            open_in_browser,
            open_in_file_manager,
            check_for_update,
            download_and_install_update,
            relaunch_app,
            start_local_api,
            stop_local_api,
            get_local_api_status,
            get_pending_deep_link_page,
            get_pending_start_task,
            get_pending_retroactive_prefill,
            log_frontend_error,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

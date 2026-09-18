mod api;
mod commands;
mod database;
mod tray;

use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};

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
fn get_pending_start_task(
    state: tauri::State<PendingStartTask>,
) -> Option<DeepLinkStartTaskParams> {
    state.0.lock().unwrap().take()
}

/**
 * Mapa **cru** da query de `deskclock://task/share`, como chegou no link.
 *
 * Não há struct tipada aqui de propósito: a chave `cf.<rótulo>` e o casamento de
 * projeto, categoria e campo personalizado contra os catálogos locais são regra
 * de domínio, e ela vive no TS (`shared/utils/shareLink.ts` e
 * `domain/utils/resolveSharedPayload.ts`). Interpretar o payload aqui criaria um
 * segundo dono do contrato.
 */
struct PendingSharedTask(Mutex<Option<HashMap<String, String>>>);

#[tauri::command]
fn get_pending_shared_task(
    state: tauri::State<PendingSharedTask>,
) -> Option<HashMap<String, String>> {
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
use commands::{
    backup_db_to_drive, check_for_update, download_and_install_update, get_bearer_json,
    get_display_server, get_local_api_status, get_platform, local_api_bridge_ready,
    local_api_respond, log_frontend, open_in_browser, open_in_file_manager, post_bearer_json,
    post_form_json, relaunch_app, save_file, start_local_api, start_oauth_server, stop_local_api,
    update_shortcuts, update_tray_icon, update_tray_tooltip,
};
use tauri::{Emitter, Manager};
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
        KillTimer, SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    let _ = KillTimer(None, TIMER_ID_TOPMOST);
    let Some(handle) = APP_HANDLE.get() else {
        return;
    };
    for label in ["overlay-compact", "overlay-popup", "toast"] {
        let Some(w) = handle.get_webview_window(label) else {
            continue;
        };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let Ok(hwnd) = w.hwnd() else { continue };
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
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
        GetClassNameW, SetTimer, SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    let Some(handle) = APP_HANDLE.get() else {
        return;
    };
    for label in ["overlay-compact", "overlay-popup", "toast"] {
        let Some(w) = handle.get_webview_window(label) else {
            continue;
        };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let Ok(wnd) = w.hwnd() else { continue };
        let _ = SetWindowPos(
            wnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
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
                GetMessageW, EVENT_SYSTEM_FOREGROUND, MSG, WINEVENT_OUTOFCONTEXT,
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
            if hook.0.is_null() {
                return;
            }
            let _hook = hook; // mantém o hook vivo; drop chama UnhookWinEvent automaticamente
            let mut msg = MSG::default();
            // DispatchMessageW é necessário para que WM_TIMER (usado pelo timer
            // de re-afirmação pós-Win+D) seja entregue ao timer_topmost_proc.
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
            }
        });
    }
    // No GNOME/Wayland (e outros compositores wlroots), reafirmar "keep above"
    // numa janela que já está em foco faz o compositor reempilhá-la — o que
    // dispara um blur nela. No popup isso é fatal: ele fecha no blur (§5.1), e o
    // usuário via o próprio popup sumir ~1s depois de abrir. A janela em foco já
    // está acima de tudo por definição, então pular a reafirmação enquanto ela
    // está focada preserva a garantia (nada pode ficar por cima do que tem foco)
    // sem competir com o compositor pela própria janela do usuário.
    #[cfg(not(target_os = "windows"))]
    std::thread::spawn(move || loop {
        for label in ["overlay-compact", "overlay-popup", "toast"] {
            if let Some(w) = handle.get_webview_window(label) {
                if w.is_visible().unwrap_or(false) && !w.is_focused().unwrap_or(false) {
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

/**
 * Interpreta um `deskclock://…`. Devolve `Err` com mensagem **em português**
 * para o que antes só virava `log::warn!`: quem cola o link à mão precisa ler o
 * motivo na tela, e o callback do `on_open_url` continua só logando.
 */
fn handle_deep_link(app: &tauri::AppHandle, raw: &str) -> Result<(), String> {
    let Some(without_scheme) = raw.strip_prefix("deskclock://") else {
        return Err("Link inválido — o endereço precisa começar com deskclock://".to_string());
    };

    let (path_part, query_part) = without_scheme
        .split_once('?')
        .unwrap_or((without_scheme, ""));
    let (action, sub_path) = path_part.split_once('/').unwrap_or((path_part, ""));
    let sub_path = sub_path.trim_end_matches('/');
    let params = parse_query(query_part);

    match action {
        "navigate" => {
            if !VALID_PAGES.contains(&sub_path) {
                return Err(format!("Página desconhecida no link: '{sub_path}'"));
            }
            navigate_to(app, sub_path);
            bring_main_to_front(app);
            log::info!("Deep link: navegando para '{sub_path}'");
            Ok(())
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
                Ok(())
            }
            "share" => {
                // O mapa cru sobe inteiro: quem o interpreta é o TS.
                if let Some(state) = app.try_state::<PendingSharedTask>() {
                    *state.0.lock().unwrap() = Some(params.clone());
                }
                let _ = app.emit("deeplink:share-task", &params);
                navigate_to(app, "planning");
                bring_main_to_front(app);
                log::info!(
                    "Deep link: tarefa compartilhada recebida ({} parâmetros)",
                    params.len()
                );
                Ok(())
            }
            _ => Err(format!("Ação de tarefa desconhecida no link: '{sub_path}'")),
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
            Ok(())
        }
        _ => Err(format!("Ação desconhecida no link: '{action}'")),
    }
}

/**
 * Abre um deep link vindo de dentro do app — é o que sustenta o campo de colar
 * link. Propaga o erro de `handle_deep_link` para a tela dizer o motivo; o
 * `on_open_url` do sistema continua ignorando o `Err` e só logando.
 */
#[tauri::command]
fn open_deep_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    handle_deep_link(&app, &url)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Registrado aqui, e não no setup(): as janelas do tauri.conf.json são
        // criadas antes do hook, e no Windows uma delas já chama get_db_bootstrap
        // nesse intervalo. Ver o comentário de topo de database.rs.
        .manage(database::DbBootstrapState::default())
        .on_page_load(|webview, payload| {
            // Recarregar a janela principal derruba o ouvinte da ponte; até o novo
            // avisar prontidão, a API responde 503 em vez de pendurar até o 504.
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Started
            {
                if let Some(bridge) = webview.try_state::<Arc<api::bridge::Bridge>>() {
                    bridge.mark_unready();
                }
            }
        })
        .setup(|app| {
            // Log habilitado também em release. Targets explícitos (Stdout + LogDir)
            // para não depender do default do plugin — garante que sempre há arquivo.
            // Nível Info por padrão (dev e release) para que boot saudável, retries
            // recuperados e falhas de carga do banco/migrations fiquem persistidos sem
            // afogar o log com as queries SQL que o sqlx emite em Debug.
            //
            // Verbosidade completa (Debug + queries SQL) é opt-in e propositalmente
            // obscura para não ser ativada por engano por um usuário final:
            //  - dev: env var `DESKCLOCK_DEBUG=1` (ex.: `DESKCLOCK_DEBUG=1 pnpm tauri dev`);
            //  - produção: argumento oculto `--dck-diagnostics`, que cabe no campo
            //    "Destino" do atalho do Windows (`DeskClock.exe --dck-diagnostics`) ou
            //    no `Exec=` do .desktop no Linux.
            // O nível é fixado no boot, por isso o gatilho precisa estar disponível aqui.
            let verbose = std::env::var_os("DESKCLOCK_DEBUG").is_some()
                || std::env::args().any(|a| a == "--dck-diagnostics");
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if verbose {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    })
                    // sqlx despeja toda query SQL — só quando explicitamente pedido.
                    .level_for(
                        "sqlx",
                        if verbose {
                            log::LevelFilter::Debug
                        } else {
                            log::LevelFilter::Warn
                        },
                    )
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                            file_name: None,
                        }),
                    ])
                    .build(),
            )?;

            // Marca de boot: garante ao menos uma linha por inicialização, confirmando
            // que o pipeline de log está ativo e revelando o caminho do arquivo. Usa a
            // versão do tauri.conf.json (package_info), não a do Cargo.toml (0.1.0).
            log::info!("DeskClock {} iniciando", app.package_info().version);

            // Migrar aqui, e não pelo plugin sql, é o que impede a corrida entre as 4
            // janelas do boot de deixar o app em schema velho. Ver database.rs.
            let bootstrap = database::migrate(app.handle());
            match &bootstrap {
                Ok(b) => log::info!("Banco migrado até a versão {}", b.expected_version),
                Err(e) => log::error!("Migração do banco falhou: {e}"),
            }
            let db_ready = bootstrap.is_ok();
            app.state::<database::DbBootstrapState>().fulfill(bootstrap);

            tray::setup_tray(app)?;
            keep_overlays_topmost(app.handle().clone());

            app.manage(Arc::new(api::ApiServerState::default()));
            let bridge_handle = app.handle().clone();
            app.manage(Arc::new(api::bridge::Bridge::new(
                move |request| {
                    bridge_handle
                        .emit_to("main", api::bridge::REQUEST_EVENT, request)
                        .map_err(|e| e.to_string())
                },
                api::bridge::DEFAULT_TIMEOUT,
            )));
            app.manage(PendingDeepLinkPage(Mutex::new(None)));
            app.manage(PendingStartTask(Mutex::new(None)));
            app.manage(PendingRetroactivePrefill(Mutex::new(None)));
            app.manage(PendingSharedTask(Mutex::new(None)));
            // A API local lê o mesmo banco: sem migração aplicada, ela serviria dados
            // de um schema que o resto do app já rejeitou.
            if db_ready {
                api::server::start_on_boot(app.handle().clone());
            }

            if let Err(e) = app.deep_link().register("deskclock") {
                log::warn!("Falha ao registrar esquema deep link: {e}");
            }

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Err(e) = handle_deep_link(&app_handle, &url.to_string()) {
                        log::warn!("Deep link ignorado — {e}");
                    }
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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Sem `.add_migrations`: o plugin só conecta. Quem migra é o setup() acima,
        // e há um dono só — ver database.rs.
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            database::get_db_bootstrap,
            save_file,
            update_tray_tooltip,
            update_tray_icon,
            update_shortcuts,
            start_oauth_server,
            post_form_json,
            get_bearer_json,
            post_bearer_json,
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
            local_api_respond,
            local_api_bridge_ready,
            get_pending_deep_link_page,
            get_pending_start_task,
            get_pending_retroactive_prefill,
            get_pending_shared_task,
            open_deep_link,
            log_frontend,
            backup_db_to_drive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// A ACL recusa em runtime o comando que ficou fora do manifesto ou da
/// capability, e o app não abre (`get_db_bootstrap not allowed`). Estes testes
/// trazem essa falha para o `cargo test`.
#[cfg(test)]
mod app_commands_acl {
    include!("../app_commands.rs");

    use serde_json::Value;
    use std::collections::BTreeSet;

    fn permission(command: &str) -> String {
        format!("allow-{}", command.replace('_', "-"))
    }

    fn registered_commands() -> BTreeSet<String> {
        let source = include_str!("lib.rs");
        let marker = concat!("generate_handler", "![");
        let start = source
            .find(marker)
            .expect("generate_handler! não encontrado")
            + marker.len();
        let end = start
            + source[start..]
                .find(']')
                .expect("generate_handler! sem fim");
        source[start..end]
            .split(',')
            .map(|entry| entry.trim().rsplit("::").next().unwrap_or("").to_string())
            .filter(|name| !name.is_empty())
            .collect()
    }

    fn app_permissions(capability: &Value) -> BTreeSet<String> {
        capability["permissions"]
            .as_array()
            .expect("capability sem permissions")
            .iter()
            .filter_map(Value::as_str)
            // Permissão de app não tem prefixo de plugin (`core:`, `sql:`…).
            .filter(|p| !p.contains(':'))
            .map(str::to_string)
            .collect()
    }

    fn windows(value: &Value) -> BTreeSet<String> {
        value
            .as_array()
            .expect("lista de janelas")
            .iter()
            .filter_map(|w| w.as_str().or_else(|| w["label"].as_str()))
            .map(str::to_string)
            .collect()
    }

    fn json(source: &str) -> Value {
        serde_json::from_str(source).expect("JSON inválido")
    }

    #[test]
    fn todo_comando_registrado_esta_no_manifesto() {
        let listed: BTreeSet<String> = SHARED_COMMANDS
            .iter()
            .chain(MAIN_ONLY_COMMANDS)
            .map(|c| c.to_string())
            .collect();
        assert_eq!(
            listed.len(),
            SHARED_COMMANDS.len() + MAIN_ONLY_COMMANDS.len(),
            "comando repetido em app_commands.rs"
        );
        assert_eq!(registered_commands(), listed);
    }

    #[test]
    fn default_libera_os_compartilhados_em_todas_as_janelas() {
        let capability = json(include_str!("../capabilities/default.json"));
        let expected: BTreeSet<String> = SHARED_COMMANDS.iter().map(|c| permission(c)).collect();
        assert_eq!(app_permissions(&capability), expected);

        let conf = json(include_str!("../tauri.conf.json"));
        assert_eq!(
            windows(&capability["windows"]),
            windows(&conf["app"]["windows"])
        );
    }

    #[test]
    fn ponte_da_api_local_so_na_janela_main() {
        let capability = json(include_str!("../capabilities/local-api-bridge.json"));
        let expected: BTreeSet<String> = MAIN_ONLY_COMMANDS.iter().map(|c| permission(c)).collect();
        assert_eq!(app_permissions(&capability), expected);
        assert_eq!(
            windows(&capability["windows"]),
            BTreeSet::from(["main".to_string()])
        );
    }
}

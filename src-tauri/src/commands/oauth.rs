use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;

/// Alinhado ao `AUTH_TIMEOUT_MS` do frontend: depois disso ninguém mais espera o retorno.
const LISTENER_DEADLINE: Duration = Duration::from_secs(5 * 60);
const ACCEPT_POLL: Duration = Duration::from_millis(150);
const READ_TIMEOUT: Duration = Duration::from_secs(3);
const CALLBACK_PATH: &str = "/callback";
const OAUTH_CALLBACK_EVENT: &str = "oauth_callback_received";

/// Prefixo que o frontend reconhece para traduzir "porta ocupada por outro programa".
const PORT_IN_USE_PREFIX: &str = "port_in_use";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OAuthServerHandle {
    pub port: u16,
    pub session: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OAuthCallbackPayload {
    pub session: u64,
    pub code: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, PartialEq)]
enum CallbackResult {
    Code(String),
    Error(String),
}

struct ActiveListener {
    cancel: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

/// Ouvintes vivos por porta. Sem o registro, uma autorização que nunca voltava
/// deixava a thread presa no `accept()` e a porta fixa do Zendesk ocupada até o
/// app fechar — toda tentativa seguinte morria no `bind`.
fn registry() -> &'static Mutex<HashMap<u16, ActiveListener>> {
    static REGISTRY: OnceLock<Mutex<HashMap<u16, ActiveListener>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_session() -> u64 {
    static SESSION: AtomicU64 = AtomicU64::new(1);
    SESSION.fetch_add(1, Ordering::Relaxed)
}

/// Serializa "parar o antigo → bind → registrar". Sem isso, dois cliques seguidos em
/// "Conectar" disputam a porta e o segundo cai no falso "ocupada por outro programa".
/// É um lock separado do `registry()` porque a thread do ouvinte trava o registro
/// ao encerrar, e o `join()` abaixo esperaria por ela para sempre.
fn start_lock() -> &'static Mutex<()> {
    static START: Mutex<()> = Mutex::new(());
    &START
}

fn stop_listener_on(port: u16) {
    let stale = registry().lock().ok().and_then(|mut map| map.remove(&port));
    if let Some(listener) = stale {
        listener.cancel.store(true, Ordering::Relaxed);
        let _ = listener.thread.join();
    }
}

/// Só remove a própria entrada: se ela já foi trocada, quem trocou cuida da nova.
fn remove_own_entry(port: u16, cancel: &Arc<AtomicBool>) {
    if let Ok(mut map) = registry().lock() {
        if map
            .get(&port)
            .is_some_and(|l| Arc::ptr_eq(&l.cancel, cancel))
        {
            map.remove(&port);
        }
    }
}

fn bind_listener(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        if e.kind() == ErrorKind::AddrInUse {
            format!("{PORT_IN_USE_PREFIX}: {e}")
        } else {
            e.to_string()
        }
    })
}

/// Sobe o ouvinte em `requested` (0 = aleatória), substituindo o anterior do
/// próprio DeskClock na mesma porta, e entrega o resultado a `on_result`.
fn start_listener<F>(requested: u16, on_result: F) -> Result<OAuthServerHandle, String>
where
    F: FnOnce(OAuthCallbackPayload) + Send + 'static,
{
    let _guard = start_lock().lock().unwrap_or_else(|e| e.into_inner());
    if requested != 0 {
        stop_listener_on(requested);
    }
    let listener = bind_listener(requested)?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let session = next_session();
    let cancel = Arc::new(AtomicBool::new(false));
    let thread_cancel = Arc::clone(&cancel);
    let thread = std::thread::spawn(move || {
        if let Some(result) = accept_until_callback(&listener, &thread_cancel) {
            let (code, error) = match result {
                CallbackResult::Code(code) => (Some(code), None),
                CallbackResult::Error(error) => (None, Some(error)),
            };
            on_result(OAuthCallbackPayload {
                session,
                code,
                error,
            });
        }
        remove_own_entry(port, &thread_cancel);
    });

    if let Ok(mut map) = registry().lock() {
        map.insert(port, ActiveListener { cancel, thread });
    }
    Ok(OAuthServerHandle { port, session })
}

/// Inicia um servidor HTTP temporário (porta pedida, ou aleatória com `None`)
/// para capturar o redirect do OAuth. Um ouvinte anterior do próprio DeskClock
/// na mesma porta é substituído. Ao receber o callback, emite
/// `oauth_callback_received` com `{ session, code, error }` e encerra; sem
/// callback, encerra sozinho no prazo.
#[tauri::command]
pub async fn start_oauth_server(
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<OAuthServerHandle, String> {
    // Substituir o ouvinte antigo espera a thread dele (`join`): fora da thread principal.
    tauri::async_runtime::spawn_blocking(move || {
        start_listener(port.unwrap_or(0), move |payload| {
            let _ = app.emit(OAUTH_CALLBACK_EVENT, payload);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Continua aceitando conexões até chegar o callback de verdade: preconnect
/// especulativo do browser, favicon ou requisição vazia não podem consumi-lo.
fn accept_until_callback(listener: &TcpListener, cancel: &AtomicBool) -> Option<CallbackResult> {
    let deadline = Instant::now() + LISTENER_DEADLINE;
    while !cancel.load(Ordering::Relaxed) && Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(result) = handle_connection(stream) {
                    return Some(result);
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => std::thread::sleep(ACCEPT_POLL),
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            Err(e) => {
                log::warn!("[oauth] accept falhou: {e}");
                return None;
            }
        }
    }
    None
}

fn handle_connection(mut stream: TcpStream) -> Option<CallbackResult> {
    // O socket aceito herda o modo não bloqueante em algumas plataformas.
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).unwrap_or(0);
    let request = String::from_utf8_lossy(&buf[..n]);

    let result = parse_callback(&request);
    let response = match &result {
        Some(CallbackResult::Code(_)) => page(
            "Autorização concluída!",
            "Pode fechar esta aba e voltar ao DeskClock.",
        ),
        Some(CallbackResult::Error(message)) => page(
            "A autorização falhou",
            &format!(
                "{}<br>Feche esta aba e tente de novo pelo DeskClock.",
                escape_html(message)
            ),
        ),
        None => {
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string()
        }
    };
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
    result
}

fn page(title: &str, body: &str) -> String {
    format!(
        concat!(
            "HTTP/1.1 200 OK\r\n",
            "Content-Type: text/html; charset=utf-8\r\n",
            "Connection: close\r\n\r\n",
            "<!DOCTYPE html><html><head><meta charset='utf-8'>",
            "<style>body{{font-family:sans-serif;text-align:center;padding:3rem;background:#111;color:#eee}}</style>",
            "</head><body><h2>{}</h2><p>{}</p></body></html>"
        ),
        title, body
    )
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Lê a primeira linha ("GET /callback?code=X HTTP/1.1") e devolve o resultado
/// só se for o caminho do callback trazendo `code` ou `error`.
fn parse_callback(request: &str) -> Option<CallbackResult> {
    let target = request.lines().next()?.split_whitespace().nth(1)?;
    let (path, query) = target.split_once('?')?;
    if path != CALLBACK_PATH {
        return None;
    }
    let params: HashMap<String, String> = query
        .split('&')
        .map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            (percent_decode(key), percent_decode(value))
        })
        .collect();

    if let Some(error) = params.get("error").filter(|e| !e.is_empty()) {
        let message = match params.get("error_description").filter(|d| !d.is_empty()) {
            Some(description) => format!("{description} ({error})"),
            None => error.clone(),
        };
        return Some(CallbackResult::Error(message));
    }
    params
        .get("code")
        .filter(|c| !c.is_empty())
        .map(|code| CallbackResult::Code(code.clone()))
}

/// Decodificação de query string (`application/x-www-form-urlencoded`): `+` vira
/// espaço e `%XX` vira byte; sequência inválida fica como está.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' => match bytes.get(i + 1..i + 3).and_then(hex_byte) {
                Some(decoded) => {
                    out.push(decoded);
                    i += 2;
                }
                None => out.push(b'%'),
            },
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_byte(pair: &[u8]) -> Option<u8> {
    let text = std::str::from_utf8(pair).ok()?;
    u8::from_str_radix(text, 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(target: &str) -> String {
        format!("GET {target} HTTP/1.1\r\nHost: localhost:27422\r\n\r\n")
    }

    #[test]
    fn extrai_o_code_do_callback() {
        assert_eq!(
            parse_callback(&get("/callback?code=abc123&state=x")),
            Some(CallbackResult::Code("abc123".into()))
        );
    }

    #[test]
    fn decodifica_o_code() {
        assert_eq!(
            parse_callback(&get("/callback?code=a%2Fb%3Dc+d")),
            Some(CallbackResult::Code("a/b=c d".into()))
        );
    }

    #[test]
    fn devolve_o_erro_com_a_descricao_decodificada() {
        assert_eq!(
            parse_callback(&get(
                "/callback?error=access_denied&error_description=O+usu%C3%A1rio+negou"
            )),
            Some(CallbackResult::Error(
                "O usuário negou (access_denied)".into()
            ))
        );
    }

    #[test]
    fn erro_sem_descricao_usa_o_codigo_do_erro() {
        assert_eq!(
            parse_callback(&get("/callback?error=invalid_request")),
            Some(CallbackResult::Error("invalid_request".into()))
        );
    }

    #[test]
    fn erro_tem_precedencia_sobre_code() {
        assert_eq!(
            parse_callback(&get("/callback?code=x&error=server_error")),
            Some(CallbackResult::Error("server_error".into()))
        );
    }

    #[test]
    fn ignora_caminho_que_nao_e_o_callback() {
        assert_eq!(parse_callback(&get("/favicon.ico")), None);
        assert_eq!(parse_callback(&get("/other?code=abc")), None);
    }

    #[test]
    fn ignora_callback_sem_code_nem_erro_e_requisicao_vazia() {
        assert_eq!(parse_callback(&get("/callback")), None);
        assert_eq!(parse_callback(&get("/callback?code=")), None);
        assert_eq!(parse_callback(""), None);
    }

    #[test]
    fn percent_invalido_fica_como_esta() {
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    #[test]
    fn porta_ocupada_por_outro_programa_vira_erro_reconhecivel() {
        let other = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = other.local_addr().unwrap().port();
        let err = bind_listener(port).unwrap_err();
        assert!(err.starts_with(PORT_IN_USE_PREFIX), "{err}");
    }

    #[test]
    fn continua_aceitando_ate_o_callback_e_para_no_cancelamento() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let cancel = AtomicBool::new(false);

        let client = std::thread::spawn(move || {
            // Conexão vazia (preconnect) e favicon antes do callback real.
            drop(TcpStream::connect(("127.0.0.1", port)).unwrap());
            for target in ["/favicon.ico", "/callback?code=ok"] {
                let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
                s.write_all(get(target).as_bytes()).unwrap();
                let mut sink = String::new();
                let _ = s.read_to_string(&mut sink);
            }
        });
        let result = accept_until_callback(&listener, &cancel);
        client.join().unwrap();
        assert_eq!(result, Some(CallbackResult::Code("ok".into())));

        cancel.store(true, Ordering::Relaxed);
        assert_eq!(accept_until_callback(&listener, &cancel), None);
    }

    fn free_port() -> u16 {
        TcpListener::bind(("127.0.0.1", 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    fn registered(port: u16) -> bool {
        registry().lock().unwrap().contains_key(&port)
    }

    #[test]
    fn ouvinte_esquecido_nao_prende_a_porta_da_tentativa_seguinte() {
        // Regressão do bug: a autorização nunca volta e o ouvinte fica vivo.
        let port = free_port();
        let listener = bind_listener(port).unwrap();
        listener.set_nonblocking(true).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = Arc::clone(&cancel);
        let thread = std::thread::spawn(move || {
            accept_until_callback(&listener, &thread_cancel);
            remove_own_entry(port, &thread_cancel);
        });
        registry()
            .lock()
            .unwrap()
            .insert(port, ActiveListener { cancel, thread });

        assert!(bind_listener(port)
            .unwrap_err()
            .starts_with(PORT_IN_USE_PREFIX));

        stop_listener_on(port);

        assert!(!registered(port));
        assert!(bind_listener(port).is_ok());
    }

    #[test]
    fn segunda_tentativa_na_mesma_porta_substitui_a_primeira() {
        let port = free_port();
        let first = start_listener(port, |_| {}).unwrap();
        let second = start_listener(port, |_| {}).unwrap();

        assert_eq!(second.port, port);
        assert_ne!(first.session, second.session);
        assert!(registered(port));

        stop_listener_on(port);
        assert!(!registered(port));
    }

    #[test]
    fn entrega_o_resultado_e_libera_a_porta_sozinho() {
        let port = free_port();
        let (tx, rx) = std::sync::mpsc::channel();
        let handle = start_listener(port, move |payload| tx.send(payload).unwrap()).unwrap();

        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(get("/callback?code=xyz").as_bytes()).unwrap();
        let payload = rx.recv_timeout(Duration::from_secs(5)).unwrap();

        assert_eq!(
            payload,
            OAuthCallbackPayload {
                session: handle.session,
                code: Some("xyz".into()),
                error: None,
            }
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        while registered(port) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(!registered(port));
        assert!(bind_listener(port).is_ok());
    }

    #[test]
    fn thread_antiga_so_remove_a_propria_entrada() {
        let port = free_port();
        let old = Arc::new(AtomicBool::new(false));
        let current = Arc::new(AtomicBool::new(false));
        registry().lock().unwrap().insert(
            port,
            ActiveListener {
                cancel: Arc::clone(&current),
                thread: std::thread::spawn(|| {}),
            },
        );

        remove_own_entry(port, &old);
        assert!(registered(port));

        remove_own_entry(port, &current);
        assert!(!registered(port));
    }
}

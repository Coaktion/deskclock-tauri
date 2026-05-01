use tauri::Emitter;

/// Inicia um servidor HTTP temporário em uma porta aleatória para capturar o
/// redirect do OAuth. Ao receber o callback, emite o evento
/// "oauth_callback_received" com o authorization code para o frontend.
#[tauri::command]
pub fn start_oauth_server(app: tauri::AppHandle, port: Option<u16>) -> Result<u16, String> {
    let bind_addr = format!("127.0.0.1:{}", port.unwrap_or(0));
    let listener =
        std::net::TcpListener::bind(&bind_addr).map_err(|e| e.to_string())?;
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

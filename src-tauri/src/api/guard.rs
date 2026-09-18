//! Barreira de origem da API local, aplicada ao roteador inteiro.

use crate::api::handlers::error_response;
use axum::{
    extract::Request,
    http::{header, HeaderMap, HeaderName, StatusCode},
    middleware::Next,
    response::Response,
};

const LOOPBACK_NAMES: [&str; 3] = ["localhost", "127.0.0.1", "::1"];

/// `[ipv6]:porta` ou `nome:porta`, com a porta opcional. `None` para colchete malformado.
fn split_host_port(host: &str) -> Option<(&str, Option<&str>)> {
    if let Some(rest) = host.strip_prefix('[') {
        let (name, after) = rest.split_once(']')?;
        if after.is_empty() {
            return Some((name, None));
        }
        return Some((name, Some(after.strip_prefix(':')?)));
    }
    Some(match host.split_once(':') {
        Some((name, port)) => (name, Some(port)),
        None => (host, None),
    })
}

fn is_loopback_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let Some((name, port)) = split_host_port(&host) else {
        return false;
    };
    let port_ok = port.is_none_or(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    port_ok && LOOPBACK_NAMES.contains(&name)
}

/// Esquema e host não diferenciam caixa (RFC 3986), então `HTTP://` que bate com o Host passa.
fn is_same_origin(origin: &str, host: &str) -> bool {
    let scheme_ok = origin
        .get(..7)
        .is_some_and(|s| s.eq_ignore_ascii_case("http://"));
    scheme_ok
        && origin
            .get(7..)
            .is_some_and(|rest| rest.eq_ignore_ascii_case(host))
}

fn is_request_allowed(host: Option<&str>, origin: Option<&str>) -> bool {
    if host.is_some_and(|h| !is_loopback_host(h)) {
        return false;
    }
    match origin {
        None => true,
        Some(origin) => host.is_some_and(|h| is_same_origin(origin, h)),
    }
}

/// `Err` quando o cabeçalho existe mas não é texto: vale como recusa, não como ausência.
fn header_str(headers: &HeaderMap, name: HeaderName) -> Result<Option<&str>, ()> {
    headers
        .get(name)
        .map(|value| value.to_str().map_err(|_| ()))
        .transpose()
}

// Bind em loopback não basta: DNS rebinding põe um domínio externo em 127.0.0.1 (o Host
// denuncia) e qualquer página aberta no navegador dispara requisição para cá (o Origin
// denuncia; POST/PUT/PATCH/DELETE sempre o levam). Sem Origin passam curl, script e cliente
// MCP, mas também o GET/HEAD cross-site do navegador (<img>, fetch no-cors), inofensivo só
// porque toda rota GET é leitura e a resposta não leva CORS: rota GET que muda estado reabre
// o buraco.
pub async fn reject_foreign_origin(request: Request, next: Next) -> Response {
    let headers = request.headers();
    let allowed = match (
        header_str(headers, header::HOST),
        header_str(headers, header::ORIGIN),
    ) {
        (Ok(host), Ok(origin)) => is_request_allowed(host, origin),
        _ => false,
    };
    if allowed {
        return next.run(request).await;
    }
    error_response(StatusCode::FORBIDDEN, "Origem não permitida.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::bridge::Bridge;
    use crate::api::routes::build_router;
    use crate::api::state::ApiState;
    use axum::body::Body;
    use axum::http::HeaderValue;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tower::ServiceExt;

    #[test]
    fn host_loopback_e_aceito() {
        for host in [
            "localhost",
            "localhost:27420",
            "LocalHost:27420",
            "127.0.0.1",
            "127.0.0.1:27420",
            "[::1]",
            "[::1]:27420",
        ] {
            assert!(is_loopback_host(host), "{host}");
        }
    }

    #[test]
    fn host_externo_ou_malformado_e_recusado() {
        for host in [
            "evil.com",
            "evil.com:27420",
            "127.0.0.1.evil.com",
            "localhost.evil.com",
            "evil.localhost",
            "localhost.",
            "user@localhost",
            "127.0.0.1:27420@evil.com",
            "[::1].evil.com",
            "[::2]:27420",
            "[::ffff:127.0.0.1]",
            "[::1]:",
            "[::1",
            "::1",
            "localhost:",
            "localhost:abc",
            "0.0.0.0",
            "",
        ] {
            assert!(!is_loopback_host(host), "{host}");
        }
    }

    #[test]
    fn origin_so_passa_se_for_a_mesma_origem_do_host() {
        let host = "localhost:27420";
        assert!(is_same_origin("http://localhost:27420", host));
        assert!(is_same_origin("HTTP://LOCALHOST:27420", host));
        for origin in [
            "http://localhost:5173",
            "http://localhost",
            "http://127.0.0.1:27420",
            "https://localhost:27420",
            "http://localhost:27420/",
            "http://user@localhost:27420",
            "https://evil.com",
            "null",
            "",
        ] {
            assert!(!is_same_origin(origin, host), "{origin}");
        }
        assert!(is_same_origin("http://[::1]:27420", "[::1]:27420"));
    }

    #[test]
    fn origin_sem_host_e_recusado() {
        assert!(!is_request_allowed(None, Some("http://localhost:27420")));
        assert!(is_request_allowed(None, None));
    }

    /// Devolve o status, se a requisição chegou à ponte e se a resposta trouxe
    /// cabeçalho de CORS. A ponte nunca responde: o que passa expira em 504.
    async fn send(headers: &[(&str, &[u8])]) -> (StatusCode, bool, bool) {
        let calls = Arc::new(Mutex::new(0usize));
        let log = calls.clone();
        let bridge = Bridge::new(
            move |_req| {
                *log.lock().unwrap() += 1;
                Ok(())
            },
            Duration::from_millis(10),
        );
        bridge.mark_ready();
        let router = build_router(Arc::new(ApiState::new(Arc::new(bridge))));
        let mut request = Request::builder().method("POST").uri("/tasks/stop");
        for (name, value) in headers {
            request = request.header(*name, HeaderValue::from_bytes(value).unwrap());
        }
        let response = router
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let cors = response
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN);
        let reached = *calls.lock().unwrap() > 0;
        (response.status(), reached, cors)
    }

    #[tokio::test]
    async fn recusas_dao_403_sem_chegar_a_ponte() {
        let cases: [&[(&str, &[u8])]; 8] = [
            &[
                ("host", b"localhost:27420"),
                ("origin", b"http://localhost:5173"),
            ],
            &[
                ("host", b"localhost:27420"),
                ("origin", b"https://evil.com"),
            ],
            &[("host", b"localhost:27420"), ("origin", b"null")],
            &[("host", b"evil.com"), ("origin", b"http://localhost:27420")],
            &[("host", b"evil.com")],
            &[("origin", b"http://localhost:27420")],
            &[
                ("host", b"localhost:27420"),
                ("origin", b"http://\xfflocal"),
            ],
            &[("host", b"local\xffhost")],
        ];
        for headers in cases {
            let (status, reached, cors) = send(headers).await;
            assert_eq!(status, StatusCode::FORBIDDEN, "{headers:?}");
            assert!(!reached, "{headers:?}");
            assert!(!cors, "{headers:?}");
        }
    }

    #[tokio::test]
    async fn sem_origin_nem_host_chega_a_ponte() {
        let (status, reached, cors) = send(&[]).await;
        assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
        assert!(reached);
        assert!(!cors);
    }

    #[tokio::test]
    async fn mesma_origem_em_loopback_chega_a_ponte() {
        let cases: [&[(&str, &[u8])]; 3] = [
            &[("host", b"localhost:27420")],
            &[
                ("host", b"localhost:27420"),
                ("origin", b"http://localhost:27420"),
            ],
            &[
                ("host", b"127.0.0.1:27420"),
                ("origin", b"http://127.0.0.1:27420"),
            ],
        ];
        for headers in cases {
            let (status, reached, cors) = send(headers).await;
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{headers:?}");
            assert!(reached, "{headers:?}");
            assert!(!cors, "{headers:?}");
        }
    }

    #[tokio::test]
    async fn corpo_do_403_segue_o_formato_de_erro_da_api() {
        let bridge = Bridge::new(|_req| Ok(()), Duration::from_millis(10));
        bridge.mark_ready();
        let router = build_router(Arc::new(ApiState::new(Arc::new(bridge))));
        let request = Request::builder()
            .uri("/status")
            .header("origin", "https://evil.com")
            .body(Body::empty())
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            body,
            serde_json::json!({ "error": "Origem não permitida." })
        );
    }
}

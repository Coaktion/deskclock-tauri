//! Testes pelo HTTP, através do `build_router` inteiro: é o caminho que um
//! cliente MCP real percorre, com a barreira de origem e a negociação do rmcp.

use crate::api::bridge::Bridge;
use crate::api::routes::build_router;
use crate::api::state::ApiState;
use crate::mcp::ops::TOOL_OPS;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tower::ServiceExt;

type Calls = Arc<Mutex<Vec<(String, Value)>>>;
type Responder = fn(&str) -> (u16, Value);

/// Ponte que responde na hora pelo `responder` e registra cada `op` + params.
fn fake_state(ready: bool, responder: Responder) -> (Arc<ApiState>, Calls) {
    let calls: Calls = Arc::default();
    let (tx, mut rx) = mpsc::unbounded_channel::<(String, String, Value)>();
    let bridge = Arc::new(Bridge::new(
        move |req| {
            tx.send((req.id.to_string(), req.op.to_string(), req.params.clone()))
                .map_err(|e| e.to_string())
        },
        Duration::from_secs(2),
    ));
    if ready {
        bridge.mark_ready();
    }
    let (responding, log) = (bridge.clone(), calls.clone());
    tokio::spawn(async move {
        while let Some((id, op, params)) = rx.recv().await {
            let (status, body) = responder(&op);
            log.lock().unwrap().push((op, params));
            responding.respond(&id, status, body);
        }
    });
    (Arc::new(ApiState::new(bridge)), calls)
}

fn ok_responder(op: &str) -> (u16, Value) {
    match op {
        "status.get" => (200, json!({ "running": false, "task": null, "today": {} })),
        "workspaces.list" => (200, json!([{ "id": "w1", "active": true }])),
        other => (200, json!([{ "id": format!("{other}-1") }])),
    }
}

/// `extra` acrescenta cabeçalhos; um `host` ali substitui o padrão de loopback.
async fn post(state: Arc<ApiState>, extra: &[(&str, &str)], body: Value) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri("/mcp")
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream");
    if !extra
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case("host"))
    {
        request = request.header("host", "127.0.0.1:27421");
    }
    for (name, value) in extra {
        request = request.header(*name, *value);
    }
    let response = build_router(state)
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn call_tool(state: Arc<ApiState>, name: &str, arguments: Value) -> Value {
    let (status, body) = post(
        state,
        &[],
        json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": name, "arguments": arguments }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["result"].clone()
}

fn error_text(result: &Value) -> &str {
    assert_eq!(result["isError"], json!(true), "{result}");
    result["content"][0]["text"].as_str().unwrap()
}

#[tokio::test]
async fn initialize_responde_com_a_capacidade_de_tools() {
    let (state, _) = fake_state(true, ok_responder);
    let (status, body) = post(
        state,
        &[],
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "teste", "version": "1.0" }
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["result"]["serverInfo"]["name"], "deskclock");
    let conf: Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
    assert_eq!(body["result"]["serverInfo"]["version"], conf["version"]);
    assert!(
        body["result"]["capabilities"]["tools"].is_object(),
        "{body}"
    );
}

#[tokio::test]
async fn tools_list_devolve_exatamente_as_tools_da_tabela_e_somente_leitura() {
    let (state, _) = fake_state(true, ok_responder);
    let (status, body) = post(
        state,
        &[],
        json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let tools = body["result"]["tools"].as_array().unwrap();
    let mut names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    names.sort_unstable();
    let mut expected: Vec<&str> = TOOL_OPS.iter().map(|(name, _)| *name).collect();
    expected.sort_unstable();
    assert_eq!(names, expected);
    assert_eq!(names, ["get_status", "list_catalog"]);
    for tool in tools {
        assert_eq!(tool["annotations"]["readOnlyHint"], json!(true), "{tool}");
        assert!(
            tool["inputSchema"]["properties"]["workspaceId"].is_object(),
            "{tool}"
        );
    }
}

#[tokio::test]
async fn get_status_repassa_o_workspace_e_devolve_o_corpo_como_veio() {
    let (state, calls) = fake_state(true, ok_responder);
    let result = call_tool(state, "get_status", json!({ "workspaceId": "w1" })).await;

    assert_eq!(
        *calls.lock().unwrap(),
        [("status.get".to_string(), json!({ "workspaceId": "w1" }))]
    );
    assert_eq!(result["isError"], json!(false), "{result}");
    let (_, expected) = ok_responder("status.get");
    assert_eq!(result["structuredContent"], expected);
    let text: Value = serde_json::from_str(result["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(text, expected);
}

#[tokio::test]
async fn get_status_sem_argumentos_manda_workspace_nulo() {
    let (state, calls) = fake_state(true, ok_responder);
    call_tool(state, "get_status", json!({})).await;
    assert_eq!(
        *calls.lock().unwrap(),
        [("status.get".to_string(), json!({ "workspaceId": null }))]
    );
}

#[tokio::test]
async fn list_catalog_junta_as_tres_listas() {
    let (state, calls) = fake_state(true, ok_responder);
    let result = call_tool(state, "list_catalog", json!({ "workspaceId": "w2" })).await;

    let ops: Vec<String> = calls.lock().unwrap().iter().map(|c| c.0.clone()).collect();
    assert_eq!(ops, ["workspaces.list", "projects.list", "categories.list"]);
    for (_, params) in calls.lock().unwrap().iter() {
        assert_eq!(params, &json!({ "workspaceId": "w2" }));
    }
    assert_eq!(
        result["structuredContent"],
        json!({
            "workspaces": [{ "id": "w1", "active": true }],
            "projects": [{ "id": "projects.list-1" }],
            "categories": [{ "id": "categories.list-1" }]
        })
    );
}

#[tokio::test]
async fn erro_da_ponte_vira_is_error_com_a_mensagem_do_ts() {
    fn not_found(_: &str) -> (u16, Value) {
        (404, json!({ "error": "Workspace não encontrado" }))
    }
    fn conflict(op: &str) -> (u16, Value) {
        if op == "projects.list" {
            (409, json!({ "error": "Conflito" }))
        } else {
            ok_responder(op)
        }
    }
    let (state, _) = fake_state(true, not_found);
    let result = call_tool(state, "get_status", json!({ "workspaceId": "x" })).await;
    assert_eq!(error_text(&result), "Workspace não encontrado");

    let (state, calls) = fake_state(true, conflict);
    let result = call_tool(state, "list_catalog", json!({})).await;
    assert_eq!(error_text(&result), "Conflito");
    // Para no primeiro erro: a terceira op não é chamada.
    assert_eq!(calls.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn ponte_nao_pronta_vira_is_error() {
    let (state, calls) = fake_state(false, ok_responder);
    let result = call_tool(state.clone(), "get_status", json!({})).await;
    assert_eq!(
        error_text(&result),
        "App ainda carregando — tente novamente em instantes"
    );
    let result = call_tool(state, "list_catalog", json!({})).await;
    assert!(result["isError"] == json!(true), "{result}");
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn origin_de_fora_e_recusado_pela_barreira_antes_do_mcp() {
    let (state, calls) = fake_state(true, ok_responder);
    let (status, body) = post(
        state,
        &[("origin", "https://evil.com")],
        json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body, json!({ "error": "Origem não permitida." }));
    assert!(calls.lock().unwrap().is_empty());
}

/// A revisão 2026-07-28 do protocolo não tem `initialize`: cada requisição leva a
/// versão no cabeçalho e no `_meta`. Cliente novo tem de funcionar sem sessão.
#[tokio::test]
async fn cliente_da_revisao_2026_07_28_chama_tool_sem_handshake() {
    let (state, calls) = fake_state(true, ok_responder);
    let body = json!({
        "jsonrpc": "2.0", "id": 7, "method": "tools/call",
        "params": {
            "name": "get_status", "arguments": {},
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": { "name": "teste", "version": "1.0" },
                "io.modelcontextprotocol/clientCapabilities": {}
            }
        }
    });
    let (status, body) = post(
        state,
        &[
            ("mcp-protocol-version", "2026-07-28"),
            ("mcp-method", "tools/call"),
            ("mcp-name", "get_status"),
        ],
        body,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["result"]["isError"], json!(false), "{body}");
    assert_eq!(calls.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn ponte_que_nao_responde_vira_is_error_de_timeout() {
    let bridge = Bridge::new(|_req| Ok(()), Duration::from_millis(10));
    bridge.mark_ready();
    let state = Arc::new(ApiState::new(Arc::new(bridge)));
    let result = call_tool(state, "get_status", json!({})).await;
    assert_eq!(error_text(&result), "O app não respondeu a tempo");
}

#[tokio::test]
async fn host_de_fora_e_recusado_pela_barreira_antes_do_mcp() {
    let (state, calls) = fake_state(true, ok_responder);
    let (status, body) = post(
        state,
        &[("host", "evil.com")],
        json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body, json!({ "error": "Origem não permitida." }));
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn falha_ao_emitir_vira_is_error_com_o_motivo() {
    let bridge = Bridge::new(|_req| Err("sem janela".into()), Duration::from_secs(1));
    bridge.mark_ready();
    let state = Arc::new(ApiState::new(Arc::new(bridge)));
    let result = call_tool(state, "get_status", json!({})).await;
    assert_eq!(error_text(&result), "Falha ao falar com o app: sem janela");
}

#[tokio::test]
async fn corpo_de_erro_fora_do_formato_vai_cru() {
    fn raw(_: &str) -> (u16, Value) {
        (500, json!("quebrou"))
    }
    let (state, _) = fake_state(true, raw);
    let result = call_tool(state, "get_status", json!({})).await;
    assert_eq!(error_text(&result), "\"quebrou\"");
}

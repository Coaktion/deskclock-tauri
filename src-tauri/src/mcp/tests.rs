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

async fn list_tools(state: Arc<ApiState>) -> Vec<Value> {
    let (status, body) = post(
        state,
        &[],
        json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["result"]["tools"].as_array().unwrap().clone()
}

#[tokio::test]
async fn tools_list_devolve_exatamente_as_tools_da_tabela() {
    let (state, _) = fake_state(true, ok_responder);
    let tools = list_tools(state).await;
    let mut names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    names.sort_unstable();
    let mut expected: Vec<&str> = TOOL_OPS.iter().map(|(name, _)| *name).collect();
    expected.sort_unstable();
    assert_eq!(names, expected);
    assert_eq!(
        names,
        [
            "get_status",
            "list_catalog",
            "list_planned_tasks",
            "pause_task",
            "resume_task",
            "start_planned_task",
            "start_task",
            "stop_task",
        ]
    );
}

#[tokio::test]
async fn anotacoes_separam_leitura_de_escrita_e_nenhuma_e_destrutiva() {
    let (state, _) = fake_state(true, ok_responder);
    // (tool, readOnly, idempotent, openWorld) — idempotente = repetir não muda
    // mais nada: a segunda pausa, retomada, parada ou Play da planejada só erra.
    // Mundo aberto = pode disparar o envio automático às integrações.
    let expected: &[(&str, bool, Option<bool>, bool)] = &[
        ("get_status", true, None, false),
        ("list_catalog", true, None, false),
        ("list_planned_tasks", true, None, false),
        ("start_task", false, Some(false), true),
        ("pause_task", false, Some(true), false),
        ("resume_task", false, Some(true), false),
        ("stop_task", false, Some(true), true),
        ("start_planned_task", false, Some(true), false),
    ];
    let tools = list_tools(state).await;
    for (name, read_only, idempotent, open_world) in expected {
        let tool = tools.iter().find(|t| t["name"] == *name).unwrap();
        let annotations = &tool["annotations"];
        assert_eq!(annotations["readOnlyHint"], json!(read_only), "{tool}");
        assert_eq!(annotations["openWorldHint"], json!(open_world), "{tool}");
        if !read_only {
            assert_eq!(annotations["destructiveHint"], json!(false), "{tool}");
            assert_eq!(annotations["idempotentHint"], json!(idempotent), "{tool}");
        }
    }
}

#[tokio::test]
async fn esquemas_de_entrada_declaram_os_campos_da_op() {
    let (state, _) = fake_state(true, ok_responder);
    let tools = list_tools(state).await;
    let schema =
        |name: &str| tools.iter().find(|t| t["name"] == name).unwrap()["inputSchema"].clone();
    let keys = |schema: &Value| {
        let mut keys: Vec<String> = schema["properties"]
            .as_object()
            .map(|p| p.keys().cloned().collect())
            .unwrap_or_default();
        keys.sort_unstable();
        keys
    };

    let start = schema("start_task");
    assert_eq!(
        keys(&start),
        [
            "billable",
            "categoryId",
            "categoryName",
            "name",
            "projectId",
            "projectName",
            "workspaceId"
        ]
    );
    assert_eq!(start["required"], json!(["billable"]));
    assert_eq!(keys(&schema("stop_task")), ["completed"]);
    let planned = schema("start_planned_task");
    assert_eq!(keys(&planned), ["id"]);
    assert_eq!(planned["required"], json!(["id"]));
    assert_eq!(
        keys(&schema("list_planned_tasks")),
        ["date", "from", "to", "workspaceId"]
    );
    assert_eq!(keys(&schema("get_status")), ["workspaceId"]);
    assert_eq!(keys(&schema("list_catalog")), ["workspaceId"]);
    assert!(keys(&schema("pause_task")).is_empty());
    assert!(keys(&schema("resume_task")).is_empty());
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

fn task_responder(op: &str) -> (u16, Value) {
    match op {
        "tasks.stop" => (200, json!({ "id": "t1", "status": "completed" })),
        "plannedTasks.list" => (200, json!([{ "id": "p1" }])),
        _ => (201, json!({ "id": "t1", "status": "running" })),
    }
}

async fn forwarded(tool: &str, arguments: Value) -> (Value, Vec<(String, Value)>) {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(state, tool, arguments).await;
    assert_eq!(result["isError"], json!(false), "{result}");
    let calls = calls.lock().unwrap().clone();
    (result, calls)
}

#[tokio::test]
async fn start_task_repassa_o_corpo_so_com_os_campos_enviados() {
    let (result, calls) = forwarded(
        "start_task",
        json!({ "name": "Reunião", "projectName": "Meu Projeto", "billable": false }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "tasks.start".to_string(),
            json!({ "body": { "name": "Reunião", "projectName": "Meu Projeto", "billable": false } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "id": "t1", "status": "running" })
    );

    let (_, calls) = forwarded(
        "start_task",
        json!({
            "name": "x", "projectId": "p", "projectName": "P", "categoryId": "c",
            "categoryName": "C", "billable": true, "workspaceId": "w"
        }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "body": {
            "name": "x", "projectId": "p", "projectName": "P", "categoryId": "c",
            "categoryName": "C", "billable": true, "workspaceId": "w"
        } })
    );
}

#[tokio::test]
async fn pause_e_resume_repassam_params_vazios() {
    for (tool, op) in [
        ("pause_task", "tasks.pause"),
        ("resume_task", "tasks.resume"),
    ] {
        let (_, calls) = forwarded(tool, json!({})).await;
        assert_eq!(calls, [(op.to_string(), json!({}))]);
    }
}

#[tokio::test]
async fn stop_task_repassa_completed_e_embrulha_a_tarefa() {
    let (result, calls) = forwarded("stop_task", json!({ "completed": false })).await;
    assert_eq!(
        calls,
        [(
            "tasks.stop".to_string(),
            json!({ "body": { "completed": false } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "task": { "id": "t1", "status": "completed" } })
    );

    // Omitido fica ausente: o TS aplica o padrão (true).
    let (_, calls) = forwarded("stop_task", json!({})).await;
    assert_eq!(calls[0].1, json!({ "body": {} }));
}

#[tokio::test]
async fn stop_task_descartado_devolve_task_nulo() {
    fn discarded(_: &str) -> (u16, Value) {
        (204, Value::Null)
    }
    let (state, _) = fake_state(true, discarded);
    let result = call_tool(state, "stop_task", json!({})).await;
    assert_eq!(result["isError"], json!(false), "{result}");
    assert_eq!(result["structuredContent"], json!({ "task": null }));
}

#[tokio::test]
async fn start_planned_task_repassa_o_id() {
    let (_, calls) = forwarded("start_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(
        calls,
        [("tasks.startPlanned".to_string(), json!({ "id": "p1" }))]
    );
}

#[tokio::test]
async fn start_planned_task_sem_id_vira_is_error_sem_chamar_a_ponte() {
    let (state, calls) = fake_state(true, task_responder);
    // Convenção do rmcp 3.4: argumento que não desserializa vira resultado com
    // `isError`, não erro JSON-RPC — o modelo lê o campo que faltou e refaz.
    let result = call_tool(state, "start_planned_task", json!({})).await;
    assert_eq!(
        error_text(&result),
        "failed to deserialize parameters: missing field `id`"
    );
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn start_planned_task_com_tarefa_ativa_vira_is_error_com_a_mensagem() {
    fn conflict(_: &str) -> (u16, Value) {
        (
            409,
            json!({ "error": "Já existe uma tarefa em execução ou pausada. Pare-a antes (POST /tasks/stop)." }),
        )
    }
    let (state, _) = fake_state(true, conflict);
    let result = call_tool(state, "start_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(
        error_text(&result),
        "Já existe uma tarefa em execução ou pausada. Pare-a antes (POST /tasks/stop)."
    );
}

#[tokio::test]
async fn list_planned_tasks_manda_as_quatro_chaves_como_a_rest() {
    let (result, calls) = forwarded("list_planned_tasks", json!({ "date": "2026-09-18" })).await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.list".to_string(),
            json!({ "date": "2026-09-18", "from": null, "to": null, "workspaceId": null })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "plannedTasks": [{ "id": "p1" }] })
    );

    let (_, calls) = forwarded(
        "list_planned_tasks",
        json!({ "from": "2026-09-14", "to": "2026-09-20", "workspaceId": "w1" }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "date": null, "from": "2026-09-14", "to": "2026-09-20", "workspaceId": "w1" })
    );
}

#[tokio::test]
async fn start_task_sem_billable_vira_is_error_sem_chamar_a_ponte() {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(state, "start_task", json!({ "name": "x" })).await;
    assert!(
        error_text(&result).contains("missing field `billable`"),
        "{result}"
    );
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn list_planned_tasks_sem_filtros_manda_as_quatro_chaves_nulas() {
    let (_, calls) = forwarded("list_planned_tasks", json!({})).await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.list".to_string(),
            json!({ "date": null, "from": null, "to": null, "workspaceId": null })
        )]
    );
}

/// `arguments` é opcional no `tools/call`: o rmcp troca a ausência por `{}`, e os
/// campos `Option` bastam para desserializar — os structs não precisam de `Default`.
#[tokio::test]
async fn tools_sem_o_campo_arguments_funcionam() {
    for (tool, op) in [
        ("get_status", "status.get"),
        ("list_planned_tasks", "plannedTasks.list"),
        ("stop_task", "tasks.stop"),
        ("pause_task", "tasks.pause"),
    ] {
        let (state, calls) = fake_state(true, task_responder);
        let (status, body) = post(
            state,
            &[],
            json!({
                "jsonrpc": "2.0", "id": 4, "method": "tools/call",
                "params": { "name": tool }
            }),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["result"]["isError"], json!(false), "{tool}: {body}");
        assert_eq!(calls.lock().unwrap()[0].0, op);
    }
}

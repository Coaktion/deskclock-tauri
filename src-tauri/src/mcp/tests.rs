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
            "cancel_task",
            "complete_planned_task",
            "create_category",
            "create_custom_field",
            "create_project",
            "create_workspace",
            "delete_categories",
            "delete_category",
            "delete_custom_field",
            "delete_planned_task",
            "delete_project",
            "delete_projects",
            "delete_task",
            "delete_tasks",
            "delete_workspace",
            "duplicate_planned_task",
            "get_status",
            "get_totals",
            "get_week_totals",
            "import_categories",
            "import_projects",
            "list_catalog",
            "list_custom_fields",
            "list_planned_tasks",
            "list_project_categories",
            "list_tasks",
            "log_past_task",
            "log_planned_task",
            "merge_tasks",
            "move_tasks_to_workspace",
            "pause_task",
            "plan_task",
            "preview_send_to_integration",
            "resume_task",
            "send_tasks_to_integration",
            "set_active_workspace",
            "set_project_categories",
            "set_task_billable",
            "start_planned_task",
            "start_task",
            "stop_task",
            "uncomplete_planned_task",
            "update_category",
            "update_custom_field",
            "update_planned_task",
            "update_project",
            "update_running_task",
            "update_task",
            "update_workspace",
        ]
    );
}

#[tokio::test]
async fn anotacoes_separam_leitura_de_escrita_e_marcam_as_destrutivas() {
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
        ("list_tasks", true, None, false),
        ("get_totals", true, None, false),
        ("get_week_totals", true, None, false),
        // Gravar no Histórico não dispara o envio por tarefa (só o `stop` dispara).
        ("plan_task", false, Some(false), false),
        ("log_past_task", false, Some(false), false),
        ("log_planned_task", false, Some(true), false),
        ("list_custom_fields", true, None, false),
        ("create_custom_field", false, Some(false), false),
        ("update_custom_field", false, Some(true), false),
        ("delete_custom_field", false, Some(true), false),
        // Editar não envia às integrações: o envio por tarefa só roda no `stop`.
        ("update_running_task", false, Some(true), false),
        ("update_task", false, Some(true), false),
        ("update_planned_task", false, Some(true), false),
        // Concluir de novo o mesmo dia, ou desmarcar um dia já desmarcado, não muda nada.
        ("complete_planned_task", false, Some(true), false),
        ("uncomplete_planned_task", false, Some(true), false),
        ("duplicate_planned_task", false, Some(false), false),
        // A segunda exclusão ou o segundo descarte só erra (404).
        ("delete_planned_task", false, Some(true), false),
        ("cancel_task", false, Some(true), false),
        // Fase B. Exclusões e unificação: a segunda chamada só erra (404) — os ids
        // já não existem. Criar com nome repetido só erra (409); importar de novo
        // pula tudo. `move` repetido erra (destino igual), mas `copy` copia de novo.
        ("delete_task", false, Some(true), false),
        ("delete_tasks", false, Some(true), false),
        ("set_task_billable", false, Some(true), false),
        ("merge_tasks", false, Some(true), false),
        ("move_tasks_to_workspace", false, Some(false), false),
        ("create_project", false, Some(true), false),
        ("update_project", false, Some(true), false),
        ("delete_project", false, Some(true), false),
        ("import_projects", false, Some(true), false),
        ("delete_projects", false, Some(true), false),
        ("create_category", false, Some(true), false),
        ("update_category", false, Some(true), false),
        ("delete_category", false, Some(true), false),
        ("import_categories", false, Some(true), false),
        ("delete_categories", false, Some(true), false),
        ("list_project_categories", true, None, false),
        ("set_project_categories", false, Some(true), false),
        ("create_workspace", false, Some(true), false),
        ("update_workspace", false, Some(true), false),
        ("delete_workspace", false, Some(true), false),
        // Ativar o que já está ativo não muda nada; com tarefa ativa só erra (409).
        ("set_active_workspace", false, Some(true), false),
        // Fase C1. A prévia só lê o banco local. O envio escreve no serviço
        // externo; Sheets e Clockify acrescentam linha a cada envio, então
        // repetir duplica (o Monday reescreve, mas a anotação vale para as três).
        ("preview_send_to_integration", true, None, false),
        ("send_tasks_to_integration", false, Some(false), true),
    ];
    // Toda tool está na tabela: tool nova sem anotação conferida reprova aqui.
    assert_eq!(expected.len(), TOOL_OPS.len());
    let tools = list_tools(state).await;
    for (name, read_only, idempotent, open_world) in expected {
        let tool = tools.iter().find(|t| t["name"] == *name).unwrap();
        let annotations = &tool["annotations"];
        assert_eq!(annotations["readOnlyHint"], json!(read_only), "{tool}");
        assert_eq!(annotations["openWorldHint"], json!(open_world), "{tool}");
        if !read_only {
            // Só estas apagam algo que o usuário escolheu guardar.
            let destructive = [
                "delete_custom_field",
                "delete_planned_task",
                "cancel_task",
                "delete_task",
                "delete_tasks",
                "merge_tasks",
                "delete_project",
                "delete_projects",
                "delete_category",
                "delete_categories",
                "delete_workspace",
            ]
            .contains(name);
            assert_eq!(annotations["destructiveHint"], json!(destructive), "{tool}");
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
            "customValues",
            "name",
            "projectId",
            "projectName",
            "workspaceId"
        ]
    );
    assert_eq!(sorted(&start["required"]), ["billable"]);
    assert_eq!(
        start["properties"]["customValues"]["additionalProperties"]["type"],
        json!("string"),
        "{start}"
    );
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

    let plan = schema("plan_task");
    assert_eq!(
        keys(&plan),
        [
            "actions",
            "billable",
            "categoryId",
            "categoryName",
            "customValues",
            "endTime",
            "name",
            "periodEnd",
            "periodStart",
            "projectId",
            "projectName",
            "recurringDays",
            "scheduleDate",
            "scheduleType",
            "startTime",
            "workspaceId"
        ]
    );
    assert_eq!(
        sorted(&plan["required"]),
        ["billable", "name", "scheduleType"]
    );
    assert_eq!(
        plan["properties"]["scheduleType"]["enum"],
        json!(["specific_date", "recurring", "period"]),
        "{plan}"
    );
    let action = &plan["properties"]["actions"]["items"];
    assert_eq!(
        action["properties"]["type"]["enum"],
        json!(["open_url", "open_file"]),
        "{plan}"
    );
    assert_eq!(sorted(&action["required"]), ["type", "value"]);

    let past = schema("log_past_task");
    assert_eq!(
        keys(&past),
        [
            "billable",
            "categoryId",
            "categoryName",
            "customValues",
            "endTime",
            "name",
            "projectId",
            "projectName",
            "startTime",
            "workspaceId"
        ]
    );
    assert_eq!(
        sorted(&past["required"]),
        ["billable", "endTime", "startTime"]
    );

    let launch = schema("log_planned_task");
    assert_eq!(keys(&launch), ["date", "endTime", "id", "startTime"]);
    assert_eq!(sorted(&launch["required"]), ["id"]);

    let tasks = schema("list_tasks");
    assert_eq!(
        keys(&tasks),
        [
            "billable",
            "categoryId",
            "from",
            "name",
            "projectId",
            "to",
            "workspaceId"
        ]
    );
    assert_eq!(keys(&schema("get_totals")), ["from", "to", "workspaceId"]);
    assert_eq!(keys(&schema("get_week_totals")), ["date", "workspaceId"]);
    assert!(keys(&schema("list_custom_fields")).is_empty());
    let create = schema("create_custom_field");
    assert_eq!(keys(&create), ["label", "optionLabels", "type"]);
    assert_eq!(sorted(&create["required"]), ["label", "type"]);
    assert_eq!(
        create["properties"]["type"]["enum"],
        json!(["text", "multiline", "select", "checkbox"]),
        "{create}"
    );
    let update = schema("update_custom_field");
    assert_eq!(keys(&update), ["archived", "id", "label", "optionLabels"]);
    assert_eq!(sorted(&update["required"]), ["id"]);
    let delete = schema("delete_custom_field");
    assert_eq!(keys(&delete), ["id"]);
    assert_eq!(sorted(&delete["required"]), ["id"]);
    let edit_fields = [
        "billable",
        "categoryId",
        "categoryName",
        "customValues",
        "projectId",
        "projectName",
    ];
    let with = |extra: &[&str]| {
        let mut all: Vec<String> = edit_fields
            .iter()
            .chain(extra)
            .map(|k| k.to_string())
            .collect();
        all.sort_unstable();
        all
    };
    let running = schema("update_running_task");
    assert_eq!(keys(&running), with(&["name", "startTime"]));
    assert!(
        running.get("required").is_none_or(|r| r == &json!([])),
        "{running}"
    );
    let task = schema("update_task");
    assert_eq!(keys(&task), with(&["endTime", "id", "name", "startTime"]));
    assert_eq!(sorted(&task["required"]), ["id"]);
    let planned_update = schema("update_planned_task");
    assert_eq!(
        keys(&planned_update),
        with(&[
            "actions",
            "endTime",
            "id",
            "name",
            "periodEnd",
            "periodStart",
            "recurringDays",
            "scheduleDate",
            "scheduleType",
            "startTime",
        ])
    );
    assert_eq!(sorted(&planned_update["required"]), ["id"]);
    // O `null` é aceito no esquema: é como o modelo pede para limpar.
    assert_eq!(
        planned_update["properties"]["startTime"]["type"],
        json!(["string", "null"]),
        "{planned_update}"
    );
    let complete = schema("complete_planned_task");
    assert_eq!(keys(&complete), ["date", "id"]);
    assert_eq!(sorted(&complete["required"]), ["id"]);
    let uncomplete = schema("uncomplete_planned_task");
    assert_eq!(keys(&uncomplete), ["date", "id"]);
    assert_eq!(sorted(&uncomplete["required"]), ["date", "id"]);
    for by_id in ["duplicate_planned_task", "delete_planned_task"] {
        let schema = schema(by_id);
        assert_eq!(keys(&schema), ["id"], "{by_id}");
        assert_eq!(sorted(&schema["required"]), ["id"], "{by_id}");
    }
    assert!(keys(&schema("cancel_task")).is_empty());
    for read_only in ["list_tasks", "get_totals", "get_week_totals"] {
        assert!(
            schema(read_only)
                .get("required")
                .is_none_or(|r| r == &json!([])),
            "{read_only} não tem argumento obrigatório"
        );
    }
}

/// Os campos comuns vêm de um struct com `#[serde(flatten)]`; o esquema tem de
/// sair plano, sem `$ref`/`allOf`, que nem todo cliente MCP resolve.
#[tokio::test]
async fn esquemas_das_tools_que_criam_tarefa_saem_planos() {
    let (state, _) = fake_state(true, ok_responder);
    let tools = list_tools(state).await;
    for name in [
        "start_task",
        "plan_task",
        "log_past_task",
        "log_planned_task",
        "create_custom_field",
        "update_custom_field",
        "update_running_task",
        "update_task",
        "update_planned_task",
        "complete_planned_task",
    ] {
        let schema = tools.iter().find(|t| t["name"] == name).unwrap()["inputSchema"].to_string();
        for indirection in ["$ref", "$defs", "allOf", "anyOf", "oneOf"] {
            assert!(
                !schema.contains(indirection),
                "{name} tem {indirection}: {schema}"
            );
        }
    }
}

fn sorted(required: &Value) -> Vec<String> {
    let mut names: Vec<String> = required
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    names.sort_unstable();
    names
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
        "history.list" => (200, json!([{ "id": "t2" }, { "id": "t1" }])),
        "totals.period" => (200, json!({ "from": "2026-09-01", "totalSeconds": 60 })),
        "totals.week" => (
            200,
            json!({ "weekStart": "2026-09-14", "totalSeconds": 60 }),
        ),
        "customFields.list" => (200, json!([{ "id": "f1", "type": "select" }])),
        "customFields.create" => (201, json!({ "id": "f1", "label": "Etapa" })),
        "customFields.update" => (200, json!({ "id": "f1", "archived": true })),
        "customFields.delete" => (204, Value::Null),
        "tasks.updateActive" => (200, json!({ "id": "t1", "customValues": { "f1": "A" } })),
        "history.update" => (200, json!({ "id": "t2", "customValues": {} })),
        "plannedTasks.patch" => (200, json!({ "id": "p1", "customValues": {} })),
        "plannedTasks.complete" | "plannedTasks.uncomplete" => {
            (200, json!({ "id": "p1", "completedDates": [] }))
        }
        "plannedTasks.duplicate" => (201, json!({ "id": "p2" })),
        "plannedTasks.delete" | "tasks.cancel" => (204, Value::Null),
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
        ("list_tasks", "history.list"),
        ("get_totals", "totals.period"),
        ("get_week_totals", "totals.week"),
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

#[tokio::test]
async fn plan_task_repassa_o_corpo_so_com_os_campos_enviados() {
    let (result, calls) = forwarded(
        "plan_task",
        json!({
            "name": "Daily", "billable": false, "scheduleType": "recurring",
            "recurringDays": [1, 2, 3, 4, 5]
        }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.create".to_string(),
            json!({ "body": {
                "name": "Daily", "billable": false, "scheduleType": "recurring",
                "recurringDays": [1, 2, 3, 4, 5]
            } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "id": "t1", "status": "running" })
    );

    let everything = json!({
        "name": "Reunião", "projectId": "p", "projectName": "P", "categoryId": "c",
        "categoryName": "C", "billable": true, "scheduleType": "period",
        "scheduleDate": "2026-09-18", "recurringDays": [0], "periodStart": "2026-09-01",
        "periodEnd": "2026-09-30", "startTime": "09:00", "endTime": "10:00",
        "workspaceId": "w"
    });
    let (_, calls) = forwarded("plan_task", everything.clone()).await;
    assert_eq!(calls[0].1, json!({ "body": everything }));
}

#[tokio::test]
async fn plan_task_com_schedule_type_desconhecido_vira_is_error_sem_chamar_a_ponte() {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(
        state,
        "plan_task",
        json!({ "name": "x", "billable": true, "scheduleType": "daily" }),
    )
    .await;
    assert!(
        error_text(&result).contains("unknown variant `daily`"),
        "{result}"
    );
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn log_past_task_repassa_o_corpo_so_com_os_campos_enviados() {
    let (result, calls) = forwarded(
        "log_past_task",
        json!({
            "name": "Revisão", "billable": true,
            "startTime": "2026-09-15T14:00:00-03:00", "endTime": "2026-09-15T15:30:00-03:00"
        }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "history.create".to_string(),
            json!({ "body": {
                "name": "Revisão", "billable": true,
                "startTime": "2026-09-15T14:00:00-03:00", "endTime": "2026-09-15T15:30:00-03:00"
            } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "id": "t1", "status": "running" })
    );

    let everything = json!({
        "name": "x", "projectId": "p", "projectName": "P", "categoryId": "c",
        "categoryName": "C", "billable": false, "startTime": "2026-09-15T14:00:00",
        "endTime": "2026-09-15T15:00:00", "workspaceId": "w"
    });
    let (_, calls) = forwarded("log_past_task", everything.clone()).await;
    assert_eq!(calls[0].1, json!({ "body": everything }));
}

#[tokio::test]
async fn log_past_task_sem_horario_vira_is_error_sem_chamar_a_ponte() {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(
        state,
        "log_past_task",
        json!({ "billable": true, "startTime": "2026-09-15T14:00:00-03:00" }),
    )
    .await;
    assert!(
        error_text(&result).contains("missing field `endTime`"),
        "{result}"
    );
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn log_past_task_abaixo_de_1_minuto_vira_is_error_com_a_mensagem_do_dominio() {
    fn too_short(_: &str) -> (u16, Value) {
        (400, json!({ "error": "A duração mínima é 1 minuto." }))
    }
    let (state, _) = fake_state(true, too_short);
    let result = call_tool(
        state,
        "log_past_task",
        json!({
            "billable": true,
            "startTime": "2026-09-15T14:00:00-03:00", "endTime": "2026-09-15T14:00:30-03:00"
        }),
    )
    .await;
    assert_eq!(error_text(&result), "A duração mínima é 1 minuto.");
}

#[tokio::test]
async fn log_planned_task_repassa_o_id_fora_do_corpo() {
    let (result, calls) = forwarded(
        "log_planned_task",
        json!({
            "id": "p1", "date": "2026-09-15",
            "startTime": "2026-09-15T09:00:00-03:00", "endTime": "2026-09-15T10:00:00-03:00"
        }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.launchRetroactive".to_string(),
            json!({ "id": "p1", "body": {
                "date": "2026-09-15",
                "startTime": "2026-09-15T09:00:00-03:00", "endTime": "2026-09-15T10:00:00-03:00"
            } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "id": "t1", "status": "running" })
    );

    // Só o id: corpo vazio, e o TS aplica hoje e o horário da planejada.
    let (_, calls) = forwarded("log_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(calls[0].1, json!({ "id": "p1", "body": {} }));
}

#[tokio::test]
async fn log_planned_task_sem_id_vira_is_error_sem_chamar_a_ponte() {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(state, "log_planned_task", json!({ "date": "2026-09-15" })).await;
    assert_eq!(
        error_text(&result),
        "failed to deserialize parameters: missing field `id`"
    );
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn log_planned_task_ja_concluida_vira_is_error_com_a_mensagem() {
    fn conflict(_: &str) -> (u16, Value) {
        (
            409,
            json!({ "error": "A tarefa planejada 'p1' já foi concluída em 2026-09-15" }),
        )
    }
    let (state, _) = fake_state(true, conflict);
    let result = call_tool(
        state,
        "log_planned_task",
        json!({ "id": "p1", "date": "2026-09-15" }),
    )
    .await;
    assert_eq!(
        error_text(&result),
        "A tarefa planejada 'p1' já foi concluída em 2026-09-15"
    );
}

#[tokio::test]
async fn list_tasks_manda_as_sete_chaves_como_a_rest_e_embrulha_a_lista() {
    let (result, calls) = forwarded(
        "list_tasks",
        json!({
            "from": "2026-09-14", "to": "2026-09-18", "name": "revisão",
            "projectId": "p", "categoryId": "c", "billable": false, "workspaceId": "w"
        }),
    )
    .await;
    // `billable` em texto: é como a query string do `GET /tasks` chega ao TS.
    assert_eq!(
        calls,
        [(
            "history.list".to_string(),
            json!({
                "from": "2026-09-14", "to": "2026-09-18", "name": "revisão",
                "projectId": "p", "categoryId": "c", "billable": "false", "workspaceId": "w"
            })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "tasks": [{ "id": "t2" }, { "id": "t1" }] })
    );

    let (_, calls) = forwarded("list_tasks", json!({ "billable": true })).await;
    assert_eq!(
        calls[0].1,
        json!({
            "from": null, "to": null, "name": null, "projectId": null,
            "categoryId": null, "billable": "true", "workspaceId": null
        })
    );

    let (_, calls) = forwarded("list_tasks", json!({})).await;
    assert_eq!(
        calls[0].1,
        json!({
            "from": null, "to": null, "name": null, "projectId": null,
            "categoryId": null, "billable": null, "workspaceId": null
        })
    );
}

#[tokio::test]
async fn get_totals_repassa_o_periodo_e_devolve_o_corpo_como_veio() {
    let (result, calls) = forwarded(
        "get_totals",
        json!({ "from": "2026-09-01", "to": "2026-09-15", "workspaceId": "w" }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "totals.period".to_string(),
            json!({ "from": "2026-09-01", "to": "2026-09-15", "workspaceId": "w" })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "from": "2026-09-01", "totalSeconds": 60 })
    );

    let (_, calls) = forwarded("get_totals", json!({})).await;
    assert_eq!(
        calls[0].1,
        json!({ "from": null, "to": null, "workspaceId": null })
    );
}

#[tokio::test]
async fn get_week_totals_repassa_a_data_e_devolve_o_corpo_como_veio() {
    let (result, calls) = forwarded(
        "get_week_totals",
        json!({ "date": "2026-09-16", "workspaceId": "w" }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "totals.week".to_string(),
            json!({ "date": "2026-09-16", "workspaceId": "w" })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "weekStart": "2026-09-14", "totalSeconds": 60 })
    );

    let (_, calls) = forwarded("get_week_totals", json!({})).await;
    assert_eq!(calls[0].1, json!({ "date": null, "workspaceId": null }));
}

#[tokio::test]
async fn list_custom_fields_manda_params_vazios_e_embrulha_a_lista() {
    let (result, calls) = forwarded("list_custom_fields", json!({})).await;
    assert_eq!(calls, [("customFields.list".to_string(), json!({}))]);
    assert_eq!(
        result["structuredContent"],
        json!({ "customFields": [{ "id": "f1", "type": "select" }] })
    );
}

#[tokio::test]
async fn create_custom_field_repassa_o_corpo_so_com_os_campos_enviados() {
    let (result, calls) = forwarded(
        "create_custom_field",
        json!({ "label": "Etapa", "type": "select", "optionLabels": ["A", "B"] }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "customFields.create".to_string(),
            json!({ "body": { "label": "Etapa", "type": "select", "optionLabels": ["A", "B"] } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "id": "f1", "label": "Etapa" })
    );

    let (_, calls) = forwarded(
        "create_custom_field",
        json!({ "label": "Nota", "type": "text" }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "body": { "label": "Nota", "type": "text" } })
    );
}

#[tokio::test]
async fn create_custom_field_com_tipo_desconhecido_vira_is_error_sem_chamar_a_ponte() {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(
        state,
        "create_custom_field",
        json!({ "label": "X", "type": "date" }),
    )
    .await;
    assert_eq!(result["isError"], json!(true), "{result}");
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn update_custom_field_repassa_o_id_fora_do_corpo() {
    let (result, calls) = forwarded(
        "update_custom_field",
        json!({ "id": "f1", "label": "Fase", "optionLabels": ["B", "A"], "archived": false }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "customFields.update".to_string(),
            json!({ "id": "f1", "body": { "label": "Fase", "optionLabels": ["B", "A"], "archived": false } })
        )]
    );
    assert_eq!(
        result["structuredContent"],
        json!({ "id": "f1", "archived": true })
    );

    // Só o id: corpo vazio, o TS preserva tudo.
    let (_, calls) = forwarded("update_custom_field", json!({ "id": "f1" })).await;
    assert_eq!(calls[0].1, json!({ "id": "f1", "body": {} }));
}

#[tokio::test]
async fn update_e_delete_custom_field_sem_id_viram_is_error_sem_chamar_a_ponte() {
    for tool in ["update_custom_field", "delete_custom_field"] {
        let (state, calls) = fake_state(true, task_responder);
        let result = call_tool(state, tool, json!({})).await;
        assert_eq!(result["isError"], json!(true), "{tool}: {result}");
        assert!(calls.lock().unwrap().is_empty(), "{tool}");
    }
}

#[tokio::test]
async fn delete_custom_field_repassa_o_id_e_devolve_objeto_vazio_no_204() {
    let (result, calls) = forwarded("delete_custom_field", json!({ "id": "f1" })).await;
    assert_eq!(
        calls,
        [("customFields.delete".to_string(), json!({ "id": "f1" }))]
    );
    assert_eq!(result["structuredContent"], json!({}));
}

#[tokio::test]
async fn delete_custom_field_inexistente_vira_is_error_com_a_mensagem() {
    fn not_found(_: &str) -> (u16, Value) {
        (
            404,
            json!({ "error": "Campo personalizado 'f9' não encontrado" }),
        )
    }
    let (state, _) = fake_state(true, not_found);
    let result = call_tool(state, "delete_custom_field", json!({ "id": "f9" })).await;
    assert_eq!(result["isError"], json!(true));
    assert_eq!(
        error_text(&result),
        "Campo personalizado 'f9' não encontrado"
    );
}

#[tokio::test]
async fn custom_values_entra_no_corpo_das_tres_tools_que_criam_tarefa() {
    let values = json!({ "f1": "Fase 2", "f2": "true" });
    let (_, calls) = forwarded(
        "start_task",
        json!({ "billable": true, "customValues": values }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "body": { "billable": true, "customValues": values } })
    );
    let (_, calls) = forwarded(
        "plan_task",
        json!({ "name": "x", "billable": true, "scheduleType": "recurring", "customValues": values }),
    )
    .await;
    assert_eq!(calls[0].1["body"]["customValues"], values);
    let (_, calls) = forwarded(
        "log_past_task",
        json!({
            "billable": true, "customValues": values,
            "startTime": "2026-09-15T14:00:00-03:00", "endTime": "2026-09-15T15:00:00-03:00"
        }),
    )
    .await;
    assert_eq!(calls[0].1["body"]["customValues"], values);

    // Omitido, a chave nem vai no corpo.
    let (_, calls) = forwarded("start_task", json!({ "billable": true })).await;
    assert_eq!(calls[0].1, json!({ "body": { "billable": true } }));
}

#[tokio::test]
async fn custom_values_nao_aceita_valor_que_nao_e_texto() {
    let (state, calls) = fake_state(true, task_responder);
    let result = call_tool(
        state,
        "start_task",
        json!({ "billable": true, "customValues": { "f1": 3 } }),
    )
    .await;
    assert_eq!(result["isError"], json!(true), "{result}");
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn log_planned_task_nao_tem_custom_values() {
    let (state, _) = fake_state(true, ok_responder);
    let tools = list_tools(state).await;
    let schema = &tools
        .iter()
        .find(|t| t["name"] == "log_planned_task")
        .unwrap()["inputSchema"];
    assert!(
        schema["properties"].get("customValues").is_none(),
        "{schema}"
    );
}

#[tokio::test]
async fn update_running_task_repassa_so_o_enviado_e_mantem_o_null_explicito() {
    let (result, calls) = forwarded(
        "update_running_task",
        json!({ "name": null, "billable": false, "customValues": { "f1": "A" } }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "tasks.updateActive".to_string(),
            json!({ "body": { "name": null, "billable": false, "customValues": { "f1": "A" } } })
        )]
    );
    assert_eq!(result["structuredContent"]["id"], json!("t1"));

    let (_, calls) = forwarded(
        "update_running_task",
        json!({ "projectName": "P", "categoryId": null, "startTime": "2026-09-15T09:00:00-03:00" }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "body": {
            "projectName": "P", "categoryId": null, "startTime": "2026-09-15T09:00:00-03:00"
        } })
    );

    // Sem argumentos o corpo vai vazio: nada muda, em vez de tudo virar `null`.
    let (_, calls) = forwarded("update_running_task", json!({})).await;
    assert_eq!(calls[0].1, json!({ "body": {} }));
}

#[tokio::test]
async fn update_task_manda_o_id_fora_do_corpo() {
    let (result, calls) = forwarded(
        "update_task",
        json!({
            "id": "t2", "endTime": "2026-09-15T11:00:00-03:00", "projectId": null,
            "customValues": {}
        }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "history.update".to_string(),
            json!({ "id": "t2", "body": {
                "endTime": "2026-09-15T11:00:00-03:00", "projectId": null, "customValues": {}
            } })
        )]
    );
    assert_eq!(result["structuredContent"]["id"], json!("t2"));
}

#[tokio::test]
async fn update_planned_task_distingue_ausente_de_null() {
    let (result, calls) = forwarded(
        "update_planned_task",
        json!({
            "id": "p1", "name": "Daily", "startTime": null, "endTime": "10:00",
            "customValues": null,
            "actions": [{ "type": "open_url", "value": "https://exemplo.com" }]
        }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.patch".to_string(),
            json!({ "id": "p1", "body": {
                "name": "Daily", "startTime": null, "endTime": "10:00", "customValues": null,
                "actions": [{ "type": "open_url", "value": "https://exemplo.com" }]
            } })
        )]
    );
    assert_eq!(result["structuredContent"]["id"], json!("p1"));

    // Só o `id`: corpo vazio, a planejada fica como está.
    let (_, calls) = forwarded("update_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(calls[0].1, json!({ "id": "p1", "body": {} }));

    let (_, calls) = forwarded(
        "update_planned_task",
        json!({
            "id": "p1", "scheduleType": "period", "periodStart": "2026-10-01",
            "periodEnd": "2026-10-31", "scheduleDate": null, "actions": []
        }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "id": "p1", "body": {
            "scheduleType": "period", "periodStart": "2026-10-01", "periodEnd": "2026-10-31",
            "scheduleDate": null, "actions": []
        } })
    );
}

#[tokio::test]
async fn enums_das_acoes_e_do_agendamento_sao_conferidos_antes_da_ponte() {
    for (tool, args) in [
        (
            "update_planned_task",
            json!({ "id": "p1", "scheduleType": "weekly" }),
        ),
        (
            "update_planned_task",
            json!({ "id": "p1", "actions": [{ "type": "run", "value": "x" }] }),
        ),
        (
            "plan_task",
            json!({
                "name": "x", "billable": true, "scheduleType": "specific_date",
                "scheduleDate": "2026-10-22", "actions": [{ "type": "open_url" }]
            }),
        ),
    ] {
        let (state, calls) = fake_state(true, task_responder);
        let result = call_tool(state, tool, args).await;
        assert_eq!(result["isError"], json!(true), "{tool}: {result}");
        assert!(calls.lock().unwrap().is_empty(), "{tool}");
    }
}

#[tokio::test]
async fn plan_task_repassa_as_acoes() {
    let actions = json!([
        { "type": "open_url", "value": "https://exemplo.com" },
        { "type": "open_file", "value": "/home/u/a.pdf", "label": "Pauta" }
    ]);
    let (_, calls) = forwarded(
        "plan_task",
        json!({
            "name": "x", "billable": true, "scheduleType": "specific_date",
            "scheduleDate": "2026-10-22", "actions": actions
        }),
    )
    .await;
    assert_eq!(calls[0].1["body"]["actions"], actions);
}

#[tokio::test]
async fn complete_planned_task_manda_a_data_no_corpo_so_quando_enviada() {
    let (result, calls) = forwarded("complete_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.complete".to_string(),
            json!({ "id": "p1", "body": {} })
        )]
    );
    assert_eq!(result["structuredContent"]["id"], json!("p1"));

    let (_, calls) = forwarded(
        "complete_planned_task",
        json!({ "id": "p1", "date": "2026-10-21" }),
    )
    .await;
    assert_eq!(
        calls[0].1,
        json!({ "id": "p1", "body": { "date": "2026-10-21" } })
    );
}

#[tokio::test]
async fn uncomplete_planned_task_manda_id_e_data_como_o_path_da_rest() {
    let (_, calls) = forwarded(
        "uncomplete_planned_task",
        json!({ "id": "p1", "date": "2026-10-21" }),
    )
    .await;
    assert_eq!(
        calls,
        [(
            "plannedTasks.uncomplete".to_string(),
            json!({ "id": "p1", "date": "2026-10-21" })
        )]
    );
}

#[tokio::test]
async fn duplicate_planned_task_devolve_a_copia() {
    let (result, calls) = forwarded("duplicate_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(
        calls,
        [("plannedTasks.duplicate".to_string(), json!({ "id": "p1" }))]
    );
    assert_eq!(result["structuredContent"], json!({ "id": "p2" }));
}

#[tokio::test]
async fn delete_planned_task_e_cancel_task_devolvem_objeto_vazio_no_204() {
    let (result, calls) = forwarded("delete_planned_task", json!({ "id": "p1" })).await;
    assert_eq!(
        calls,
        [("plannedTasks.delete".to_string(), json!({ "id": "p1" }))]
    );
    assert_eq!(result["structuredContent"], json!({}));

    let (result, calls) = forwarded("cancel_task", json!({})).await;
    assert_eq!(calls, [("tasks.cancel".to_string(), json!({}))]);
    assert_eq!(result["structuredContent"], json!({}));
}

#[tokio::test]
async fn cancel_task_sem_tarefa_ativa_vira_is_error_com_a_mensagem() {
    fn not_found(_: &str) -> (u16, Value) {
        (404, json!({ "error": "Nenhuma tarefa ativa" }))
    }
    let (state, _) = fake_state(true, not_found);
    let result = call_tool(state, "cancel_task", json!({})).await;
    assert_eq!(error_text(&result), "Nenhuma tarefa ativa");
}

#[tokio::test]
async fn tools_de_edicao_e_planejamento_sem_argumento_obrigatorio_viram_is_error() {
    for (tool, args) in [
        ("update_task", json!({ "name": "x" })),
        ("update_planned_task", json!({ "name": "x" })),
        ("complete_planned_task", json!({ "date": "2026-10-21" })),
        ("uncomplete_planned_task", json!({ "id": "p1" })),
        ("uncomplete_planned_task", json!({ "date": "2026-10-21" })),
        ("duplicate_planned_task", json!({})),
        ("delete_planned_task", json!({})),
    ] {
        let (state, calls) = fake_state(true, task_responder);
        let result = call_tool(state, tool, args).await;
        assert_eq!(result["isError"], json!(true), "{tool}: {result}");
        assert!(calls.lock().unwrap().is_empty(), "{tool}");
    }
}

// ---------------- Fase B da paridade ----------------

fn phase_b_responder(op: &str) -> (u16, Value) {
    match op {
        "history.delete"
        | "history.deleteMany"
        | "projects.delete"
        | "projects.deleteMany"
        | "categories.delete"
        | "categories.deleteMany"
        | "workspaces.delete" => (204, Value::Null),
        "history.setBillable" => (200, json!({ "id": "t1", "billable": false })),
        "history.merge" => (201, json!({ "id": "t9" })),
        "history.move" => (200, json!({ "count": 2 })),
        "projects.import" | "categories.import" => (200, json!({ "created": 1, "skipped": ["B"] })),
        "projectCategories.list" | "projectCategories.set" => (
            200,
            json!([{ "categoryId": "c1", "source": "manual", "createdAt": "x" }]),
        ),
        "workspaces.setActive" => (200, json!({ "id": "w2", "active": true })),
        other => (201, json!({ "id": format!("{other}-1") })),
    }
}

async fn forwarded_b(tool: &str, arguments: Value) -> (Value, Vec<(String, Value)>) {
    let (state, calls) = fake_state(true, phase_b_responder);
    let result = call_tool(state, tool, arguments).await;
    assert_eq!(result["isError"], json!(false), "{tool}: {result}");
    let calls = calls.lock().unwrap().clone();
    (result, calls)
}

/// (tool, argumentos, op esperada, params esperados) — os params são os que a
/// rota REST equivalente monta: `id` do path, `workspaceId` da query (nulo quando
/// ausente) e o corpo em `body` só com o que veio.
#[tokio::test]
async fn tools_da_fase_b_repassam_os_params_como_a_rest() {
    let cases: Vec<(&str, Value, &str, Value)> = vec![
        (
            "delete_task",
            json!({ "id": "t1" }),
            "history.delete",
            json!({ "id": "t1" }),
        ),
        (
            "delete_tasks",
            json!({ "ids": ["t1", "t2"] }),
            "history.deleteMany",
            json!({ "body": { "ids": ["t1", "t2"] } }),
        ),
        (
            "set_task_billable",
            json!({ "id": "t1", "billable": false }),
            "history.setBillable",
            json!({ "id": "t1", "body": { "billable": false } }),
        ),
        (
            "merge_tasks",
            json!({ "ids": ["t1", "t2"] }),
            "history.merge",
            json!({ "body": { "ids": ["t1", "t2"] } }),
        ),
        (
            "move_tasks_to_workspace",
            json!({
                "ids": ["t1"], "toWorkspaceId": "w2", "mode": "copy",
                "project": { "kind": "match", "targetId": "p9" },
                "category": { "kind": "create", "name": "Reuniões" }
            }),
            "history.move",
            json!({ "body": {
                "ids": ["t1"], "toWorkspaceId": "w2", "mode": "copy",
                "project": { "kind": "match", "targetId": "p9" },
                "category": { "kind": "create", "name": "Reuniões" }
            } }),
        ),
        (
            "move_tasks_to_workspace",
            json!({
                "ids": ["t1"], "toWorkspaceId": "w2", "mode": "move",
                "project": { "kind": "unset" }, "category": { "kind": "unset" }
            }),
            "history.move",
            json!({ "body": {
                "ids": ["t1"], "toWorkspaceId": "w2", "mode": "move",
                "project": { "kind": "unset" }, "category": { "kind": "unset" }
            } }),
        ),
        (
            "create_project",
            json!({ "name": "ACME" }),
            "projects.create",
            json!({ "body": { "name": "ACME" } }),
        ),
        (
            "create_project",
            json!({ "name": "ACME", "workspaceId": "w2" }),
            "projects.create",
            json!({ "body": { "name": "ACME", "workspaceId": "w2" } }),
        ),
        (
            "update_project",
            json!({ "id": "p1", "name": "ACME 2" }),
            "projects.update",
            json!({ "id": "p1", "workspaceId": null, "body": { "name": "ACME 2" } }),
        ),
        (
            "update_project",
            json!({ "id": "p1", "workspaceId": "w2", "name": "ACME 2" }),
            "projects.update",
            json!({ "id": "p1", "workspaceId": "w2", "body": { "name": "ACME 2" } }),
        ),
        (
            "delete_project",
            json!({ "id": "p1" }),
            "projects.delete",
            json!({ "id": "p1", "workspaceId": null }),
        ),
        (
            "import_projects",
            json!({ "text": "A\nB" }),
            "projects.import",
            json!({ "body": { "text": "A\nB" } }),
        ),
        (
            "delete_projects",
            json!({ "ids": ["p1"], "workspaceId": "w2" }),
            "projects.deleteMany",
            json!({ "body": { "ids": ["p1"], "workspaceId": "w2" } }),
        ),
        (
            "create_category",
            json!({ "name": "Reuniões", "defaultBillable": false }),
            "categories.create",
            json!({ "body": { "name": "Reuniões", "defaultBillable": false } }),
        ),
        (
            "update_category",
            json!({ "id": "c1", "name": "Reuniões" }),
            "categories.update",
            json!({ "id": "c1", "workspaceId": null, "body": { "name": "Reuniões" } }),
        ),
        (
            "update_category",
            json!({ "id": "c1", "workspaceId": "w2", "name": "R", "defaultBillable": true }),
            "categories.update",
            json!({ "id": "c1", "workspaceId": "w2", "body": { "name": "R", "defaultBillable": true } }),
        ),
        (
            "delete_category",
            json!({ "id": "c1", "workspaceId": "w2" }),
            "categories.delete",
            json!({ "id": "c1", "workspaceId": "w2" }),
        ),
        (
            "import_categories",
            json!({ "text": "Dev\n!Reuniões", "workspaceId": "w2" }),
            "categories.import",
            json!({ "body": { "text": "Dev\n!Reuniões", "workspaceId": "w2" } }),
        ),
        (
            "delete_categories",
            json!({ "ids": ["c1", "c2"] }),
            "categories.deleteMany",
            json!({ "body": { "ids": ["c1", "c2"] } }),
        ),
        (
            "list_project_categories",
            json!({ "id": "p1" }),
            "projectCategories.list",
            json!({ "id": "p1", "workspaceId": null }),
        ),
        (
            "set_project_categories",
            json!({ "id": "p1", "categoryIds": [] }),
            "projectCategories.set",
            json!({ "id": "p1", "workspaceId": null, "body": { "categoryIds": [] } }),
        ),
        (
            "create_workspace",
            json!({ "name": "Freelas" }),
            "workspaces.create",
            json!({ "body": { "name": "Freelas" } }),
        ),
        (
            "update_workspace",
            json!({ "id": "w2", "name": "Freelas", "color": "violet" }),
            "workspaces.update",
            json!({ "id": "w2", "body": { "name": "Freelas", "color": "violet" } }),
        ),
        (
            "delete_workspace",
            json!({ "id": "w2", "mode": "move", "toWorkspaceId": "w1" }),
            "workspaces.delete",
            json!({ "id": "w2", "body": { "mode": "move", "toWorkspaceId": "w1" } }),
        ),
        (
            "delete_workspace",
            json!({ "id": "w2", "mode": "delete" }),
            "workspaces.delete",
            json!({ "id": "w2", "body": { "mode": "delete" } }),
        ),
        (
            "set_active_workspace",
            json!({ "id": "w2" }),
            "workspaces.setActive",
            json!({ "body": { "id": "w2" } }),
        ),
    ];
    for (tool, args, op, params) in cases {
        let (_, calls) = forwarded_b(tool, args).await;
        assert_eq!(calls, [(op.to_string(), params)], "{tool}");
    }
}

#[tokio::test]
async fn exclusoes_da_fase_b_devolvem_objeto_vazio_no_204() {
    for (tool, args) in [
        ("delete_task", json!({ "id": "t1" })),
        ("delete_tasks", json!({ "ids": ["t1"] })),
        ("delete_project", json!({ "id": "p1" })),
        ("delete_projects", json!({ "ids": ["p1"] })),
        ("delete_category", json!({ "id": "c1" })),
        ("delete_categories", json!({ "ids": ["c1"] })),
        ("delete_workspace", json!({ "id": "w2", "mode": "delete" })),
    ] {
        let (result, _) = forwarded_b(tool, args).await;
        assert_eq!(result["structuredContent"], json!({}), "{tool}");
    }
}

#[tokio::test]
async fn resultados_da_fase_b_saem_como_objeto() {
    let (result, _) = forwarded_b("merge_tasks", json!({ "ids": ["t1", "t2"] })).await;
    assert_eq!(result["structuredContent"], json!({ "id": "t9" }));
    let (result, _) = forwarded_b(
        "move_tasks_to_workspace",
        json!({
            "ids": ["t1"], "toWorkspaceId": "w2", "mode": "move",
            "project": { "kind": "unset" }, "category": { "kind": "unset" }
        }),
    )
    .await;
    assert_eq!(result["structuredContent"], json!({ "count": 2 }));
    let (result, _) = forwarded_b("import_projects", json!({ "text": "A\nB" })).await;
    assert_eq!(
        result["structuredContent"],
        json!({ "created": 1, "skipped": ["B"] })
    );
    // A lista de associações vai numa chave: `structuredContent` tem de ser objeto.
    let row = json!([{ "categoryId": "c1", "source": "manual", "createdAt": "x" }]);
    for (tool, args) in [
        ("list_project_categories", json!({ "id": "p1" })),
        (
            "set_project_categories",
            json!({ "id": "p1", "categoryIds": ["c1"] }),
        ),
    ] {
        let (result, _) = forwarded_b(tool, args).await;
        assert_eq!(
            result["structuredContent"],
            json!({ "projectCategories": row }),
            "{tool}"
        );
    }
}

#[tokio::test]
async fn set_active_workspace_com_tarefa_ativa_vira_is_error_com_a_mensagem() {
    fn conflict(_: &str) -> (u16, Value) {
        (
            409,
            json!({ "error": "Há uma tarefa ativa. Pare ou cancele a tarefa antes de trocar de workspace." }),
        )
    }
    let (state, _) = fake_state(true, conflict);
    let result = call_tool(state, "set_active_workspace", json!({ "id": "w2" })).await;
    assert_eq!(
        error_text(&result),
        "Há uma tarefa ativa. Pare ou cancele a tarefa antes de trocar de workspace."
    );
}

#[tokio::test]
async fn tools_da_fase_b_sem_argumento_obrigatorio_viram_is_error_sem_chamar_a_ponte() {
    let unset = json!({ "kind": "unset" });
    for (tool, args) in [
        ("delete_task", json!({})),
        ("delete_tasks", json!({})),
        ("set_task_billable", json!({ "id": "t1" })),
        ("set_task_billable", json!({ "billable": true })),
        ("merge_tasks", json!({})),
        (
            "move_tasks_to_workspace",
            json!({ "ids": ["t1"], "toWorkspaceId": "w2", "project": unset, "category": unset }),
        ),
        (
            "move_tasks_to_workspace",
            json!({ "ids": ["t1"], "toWorkspaceId": "w2", "mode": "move", "project": unset }),
        ),
        (
            "move_tasks_to_workspace",
            json!({ "ids": ["t1"], "mode": "move", "project": unset, "category": unset }),
        ),
        ("create_project", json!({})),
        ("update_project", json!({ "id": "p1" })),
        ("update_project", json!({ "name": "x" })),
        ("delete_project", json!({})),
        ("import_projects", json!({})),
        ("delete_projects", json!({})),
        ("create_category", json!({ "defaultBillable": true })),
        (
            "update_category",
            json!({ "id": "c1", "defaultBillable": true }),
        ),
        ("delete_category", json!({})),
        ("import_categories", json!({})),
        ("delete_categories", json!({})),
        ("list_project_categories", json!({})),
        ("set_project_categories", json!({ "id": "p1" })),
        ("set_project_categories", json!({ "categoryIds": [] })),
        ("create_workspace", json!({ "color": "violet" })),
        ("update_workspace", json!({ "id": "w2" })),
        // A escolha do destino dos dados é obrigatória, como no modal da tela.
        ("delete_workspace", json!({ "id": "w2" })),
        ("delete_workspace", json!({ "mode": "delete" })),
        ("set_active_workspace", json!({})),
    ] {
        let (state, calls) = fake_state(true, phase_b_responder);
        let result = call_tool(state, tool, args.clone()).await;
        assert_eq!(result["isError"], json!(true), "{tool} {args}: {result}");
        assert!(calls.lock().unwrap().is_empty(), "{tool} {args}");
    }
}

#[tokio::test]
async fn enums_da_fase_b_sao_conferidos_antes_da_ponte() {
    for (tool, args) in [
        ("delete_workspace", json!({ "id": "w2", "mode": "archive" })),
        (
            "move_tasks_to_workspace",
            json!({
                "ids": ["t1"], "toWorkspaceId": "w2", "mode": "link",
                "project": { "kind": "unset" }, "category": { "kind": "unset" }
            }),
        ),
        (
            "move_tasks_to_workspace",
            json!({
                "ids": ["t1"], "toWorkspaceId": "w2", "mode": "move",
                "project": { "kind": "keep" }, "category": { "kind": "unset" }
            }),
        ),
    ] {
        let (state, calls) = fake_state(true, phase_b_responder);
        let result = call_tool(state, tool, args).await;
        assert_eq!(result["isError"], json!(true), "{tool}: {result}");
        assert!(calls.lock().unwrap().is_empty(), "{tool}");
    }
}

#[tokio::test]
async fn esquemas_da_fase_b_declaram_os_campos_e_saem_planos() {
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
    // (tool, propriedades, obrigatórias)
    let expected: &[(&str, &[&str], &[&str])] = &[
        ("delete_task", &["id"], &["id"]),
        ("delete_tasks", &["ids"], &["ids"]),
        (
            "set_task_billable",
            &["billable", "id"],
            &["billable", "id"],
        ),
        ("merge_tasks", &["ids"], &["ids"]),
        (
            "move_tasks_to_workspace",
            &["category", "ids", "mode", "project", "toWorkspaceId"],
            &["category", "ids", "mode", "project", "toWorkspaceId"],
        ),
        ("create_project", &["name", "workspaceId"], &["name"]),
        (
            "update_project",
            &["id", "name", "workspaceId"],
            &["id", "name"],
        ),
        ("delete_project", &["id", "workspaceId"], &["id"]),
        ("import_projects", &["text", "workspaceId"], &["text"]),
        ("delete_projects", &["ids", "workspaceId"], &["ids"]),
        (
            "create_category",
            &["defaultBillable", "name", "workspaceId"],
            &["name"],
        ),
        (
            "update_category",
            &["defaultBillable", "id", "name", "workspaceId"],
            &["id", "name"],
        ),
        ("delete_category", &["id", "workspaceId"], &["id"]),
        ("import_categories", &["text", "workspaceId"], &["text"]),
        ("delete_categories", &["ids", "workspaceId"], &["ids"]),
        ("list_project_categories", &["id", "workspaceId"], &["id"]),
        (
            "set_project_categories",
            &["categoryIds", "id", "workspaceId"],
            &["categoryIds", "id"],
        ),
        ("create_workspace", &["color", "name"], &["name"]),
        (
            "update_workspace",
            &["color", "id", "name"],
            &["id", "name"],
        ),
        (
            "delete_workspace",
            &["id", "mode", "toWorkspaceId"],
            &["id", "mode"],
        ),
        ("set_active_workspace", &["id"], &["id"]),
    ];
    for (name, properties, required) in expected {
        let schema = schema(name);
        assert_eq!(keys(&schema), *properties, "{name}");
        assert_eq!(sorted(&schema["required"]), *required, "{name}");
        // Achatados (`flatten`) e enums inline: sem indireção, que nem todo cliente resolve.
        let text = schema.to_string();
        for indirection in ["$ref", "$defs", "allOf", "anyOf", "oneOf"] {
            assert!(
                !text.contains(indirection),
                "{name} tem {indirection}: {text}"
            );
        }
    }

    let delete = schema("delete_workspace");
    assert_eq!(
        delete["properties"]["mode"]["enum"],
        json!(["move", "delete"]),
        "{delete}"
    );
    let moving = schema("move_tasks_to_workspace");
    assert_eq!(
        moving["properties"]["mode"]["enum"],
        json!(["move", "copy"]),
        "{moving}"
    );
    for side in ["project", "category"] {
        let resolution = &moving["properties"][side];
        assert_eq!(
            resolution["properties"]["kind"]["enum"],
            json!(["match", "create", "unset"]),
            "{moving}"
        );
        assert_eq!(sorted(&resolution["required"]), ["kind"], "{moving}");
        let mut fields: Vec<&String> = resolution["properties"]
            .as_object()
            .unwrap()
            .keys()
            .collect();
        fields.sort_unstable();
        assert_eq!(fields, ["kind", "name", "targetId"], "{moving}");
    }
}

fn send_responder(op: &str) -> (u16, Value) {
    match op {
        "integrations.sendPreview" => (200, json!({ "integration": "monday", "days": [] })),
        "integrations.send" => (
            200,
            json!({ "sentTaskIds": ["t1"], "refused": [], "failed": [] }),
        ),
        other => (500, json!({ "error": format!("inesperada: {other}") })),
    }
}

#[tokio::test]
async fn tools_de_envio_repassam_os_params_como_a_rest() {
    let cases: Vec<(&str, Value, &str, Value)> = vec![
        (
            "preview_send_to_integration",
            json!({ "integration": "google_sheets", "from": "2026-09-14" }),
            "integrations.sendPreview",
            json!({ "id": "google_sheets", "from": "2026-09-14", "to": null }),
        ),
        (
            "send_tasks_to_integration",
            json!({ "integration": "monday", "taskIds": ["t1", "t2"] }),
            "integrations.send",
            json!({ "id": "monday", "body": { "taskIds": ["t1", "t2"] } }),
        ),
    ];
    for (tool, arguments, op, params) in cases {
        let (state, calls) = fake_state(true, send_responder);
        let result = call_tool(state, tool, arguments).await;
        assert_eq!(result["isError"], json!(false), "{tool}: {result}");
        assert!(result["structuredContent"].is_object(), "{tool}: {result}");
        let calls = calls.lock().unwrap().clone();
        assert_eq!(calls, vec![(op.to_string(), params)], "{tool}");
    }
}

#[tokio::test]
async fn integracao_fora_do_enum_ou_sem_task_ids_vira_is_error_sem_chamar_a_ponte() {
    for (tool, arguments) in [
        (
            "preview_send_to_integration",
            json!({ "integration": "jira" }),
        ),
        ("preview_send_to_integration", json!({})),
        (
            "send_tasks_to_integration",
            json!({ "integration": "clockify" }),
        ),
        (
            "send_tasks_to_integration",
            json!({ "integration": "Sheets", "taskIds": ["t1"] }),
        ),
    ] {
        let (state, calls) = fake_state(true, send_responder);
        let result = call_tool(state, tool, arguments.clone()).await;
        error_text(&result);
        assert!(calls.lock().unwrap().is_empty(), "{tool} {arguments}");
    }
}

#[tokio::test]
async fn envio_nao_configurado_vira_is_error_com_a_mensagem() {
    fn conflict(_: &str) -> (u16, Value) {
        (
            409,
            json!({ "error": "Monday não configurado. Verifique o token e o workspace." }),
        )
    }
    let (state, _) = fake_state(true, conflict);
    let result = call_tool(
        state,
        "send_tasks_to_integration",
        json!({ "integration": "monday", "taskIds": ["t1"] }),
    )
    .await;
    assert_eq!(
        error_text(&result),
        "Monday não configurado. Verifique o token e o workspace."
    );
}

#[tokio::test]
async fn esquemas_das_tools_de_envio_declaram_o_enum_e_saem_planos() {
    let (state, _) = fake_state(true, ok_responder);
    let tools = list_tools(state).await;
    for (name, required) in [
        ("preview_send_to_integration", vec!["integration"]),
        ("send_tasks_to_integration", vec!["integration", "taskIds"]),
    ] {
        let schema = tools.iter().find(|t| t["name"] == name).unwrap()["inputSchema"].clone();
        assert_eq!(sorted(&schema["required"]), required, "{name}");
        assert_eq!(
            schema["properties"]["integration"]["enum"],
            json!(["google_sheets", "clockify", "monday"]),
            "{schema}"
        );
        let text = schema.to_string();
        for indirection in ["$ref", "$defs", "allOf", "anyOf", "oneOf"] {
            assert!(
                !text.contains(indirection),
                "{name} tem {indirection}: {text}"
            );
        }
    }
}

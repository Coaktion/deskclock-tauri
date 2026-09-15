//! Handlers HTTP. Só extraem path, query e corpo, repassam à janela principal
//! pela ponte e devolvem o status e o corpo que ela decidir.

use crate::api::bridge::{BridgeError, BridgeResponse};
use crate::api::models::{
    CategoryDto, CreatePlannedTaskRequest, ErrorResponse, PlannedTaskCompleteRequest,
    PlannedTaskDto, ProjectDto, StartTaskRequest, StatusResponse, StopTaskRequest, TaskDto,
    ToggleTaskRequest, UpdatePlannedTaskRequest,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

fn error_response(status: StatusCode, message: impl Into<String>) -> Response {
    (
        status,
        Json(ErrorResponse {
            error: message.into(),
        }),
    )
        .into_response()
}

fn to_http(result: Result<BridgeResponse, BridgeError>) -> Response {
    match result {
        Ok(BridgeResponse { status, body }) => {
            let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
            if status == StatusCode::NO_CONTENT {
                status.into_response()
            } else {
                (status, Json(body)).into_response()
            }
        }
        Err(BridgeError::NotReady) => error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "App ainda carregando — tente novamente em instantes",
        ),
        Err(BridgeError::Timeout) => {
            error_response(StatusCode::GATEWAY_TIMEOUT, "O app não respondeu a tempo")
        }
        Err(BridgeError::Failed(e)) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Falha ao falar com o app: {e}"),
        ),
    }
}

async fn forward(state: &ApiState, op: &str, params: Value) -> Response {
    to_http(state.bridge.request(op, params).await)
}

/// Valida o corpo contra o DTO e devolve o JSON como o cliente mandou — é o TS
/// quem decide padrão e ausência, e reserializar o DTO apagaria a diferença
/// entre campo ausente e `null`. Corpo vazio vira `null`.
fn parse_body<T: DeserializeOwned>(body: &Bytes, required: bool) -> Result<Value, Box<Response>> {
    if body.is_empty() || body.as_ref() == b"null" {
        if required {
            return Err(Box::new(error_response(
                StatusCode::BAD_REQUEST,
                "Corpo JSON obrigatório",
            )));
        }
        return Ok(Value::Null);
    }
    let value: Value = serde_json::from_slice(body).map_err(invalid_json)?;
    serde_json::from_value::<T>(value.clone()).map_err(invalid_json)?;
    Ok(value)
}

fn invalid_json(e: serde_json::Error) -> Box<Response> {
    Box::new(error_response(
        StatusCode::BAD_REQUEST,
        format!("JSON inválido: {e}"),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceQuery {
    workspace_id: Option<String>,
}

// Submódulos por recurso: enxergam `forward`, `parse_body` e `WorkspaceQuery`
// sem que eles precisem sair do escopo privado deste módulo.
pub mod catalog;
pub mod custom_fields;
pub mod workspaces;

/// Valida o corpo e o repassa em `params.body`, junto do que a rota já extraiu.
async fn forward_with_body<T: DeserializeOwned>(
    state: &ApiState,
    op: &str,
    body: &Bytes,
    required: bool,
    mut params: Value,
) -> Response {
    match parse_body::<T>(body, required) {
        Ok(body) => {
            params["body"] = body;
            forward(state, op, params).await
        }
        Err(r) => *r,
    }
}

// ---------------- GET /status ----------------

#[utoipa::path(
    get,
    path = "/status",
    tag = "status",
    params(
        ("workspaceId" = Option<String>, Query, description = "Workspace dos totais de hoje. Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Estado atual do timer e totais do dia", body = StatusResponse)
    )
)]
pub async fn get_status(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(
        &state,
        "status.get",
        json!({ "workspaceId": q.workspace_id }),
    )
    .await
}

// ---------------- POST /tasks/start ----------------

#[utoipa::path(
    post,
    path = "/tasks/start",
    tag = "tasks",
    request_body(
        content = StartTaskRequest,
        description = "Dados da nova tarefa. Todos os campos são opcionais exceto `billable`. \
            A tarefa ativa, se houver, é concluída antes (com as regras de parada).",
        example = json!({
            "name": "Reunião de planejamento",
            "projectName": "Meu Projeto",
            "categoryName": "Reuniões",
            "billable": true
        })
    ),
    responses(
        (status = 201, description = "Tarefa iniciada", body = TaskDto),
        (status = 409, description = "Workspace, projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn post_start(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    match parse_body::<StartTaskRequest>(&body, true) {
        Ok(body) => forward(&state, "tasks.start", json!({ "body": body })).await,
        Err(r) => *r,
    }
}

// ---------------- POST /tasks/pause ----------------

#[utoipa::path(
    post,
    path = "/tasks/pause",
    tag = "tasks",
    responses(
        (status = 200, description = "Tarefa pausada", body = TaskDto),
        (status = 404, description = "Nenhuma tarefa em execução", body = ErrorResponse)
    )
)]
pub async fn post_pause(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "tasks.pause", json!({})).await
}

// ---------------- POST /tasks/resume ----------------

#[utoipa::path(
    post,
    path = "/tasks/resume",
    tag = "tasks",
    responses(
        (status = 200, description = "Tarefa retomada", body = TaskDto),
        (status = 404, description = "Nenhuma tarefa pausada", body = ErrorResponse)
    )
)]
pub async fn post_resume(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "tasks.resume", json!({})).await
}

// ---------------- POST /tasks/stop ----------------

#[utoipa::path(
    post,
    path = "/tasks/stop",
    tag = "tasks",
    request_body(
        content = StopTaskRequest,
        description = "Opcional — corpo pode ser omitido. `completed` define se a tarefa foi concluída (padrão: true). \
            Aplica as regras de parada: descarte de tarefa com menos de 1 minuto, arredondamento, \
            conclusão da planejada de origem e envio automático.",
        example = json!({ "completed": true })
    ),
    responses(
        (status = 200, description = "Tarefa parada", body = TaskDto),
        (status = 204, description = "Tarefa descartada por durar menos de 1 minuto"),
        (status = 404, description = "Nenhuma tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn post_stop(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    match parse_body::<StopTaskRequest>(&body, false) {
        Ok(body) => forward(&state, "tasks.stop", json!({ "body": body })).await,
        Err(r) => *r,
    }
}

// ---------------- POST /tasks/toggle ----------------

#[utoipa::path(
    post,
    path = "/tasks/toggle",
    tag = "tasks",
    request_body(
        content = ToggleTaskRequest,
        description = "Opcional — pode ser omitido ou enviado como `{}`. \
            Se houver tarefa em execução: pausa. Se estiver pausada: retoma. \
            Se não houver tarefa ativa: inicia nova com os dados fornecidos.",
        example = json!({
            "name": "Revisão de código",
            "projectName": "Meu Projeto",
            "billable": true
        })
    ),
    responses(
        (status = 200, description = "Novo estado da tarefa", body = TaskDto),
        (status = 409, description = "Workspace, projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn post_toggle(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    match parse_body::<ToggleTaskRequest>(&body, false) {
        Ok(body) => forward(&state, "tasks.toggle", json!({ "body": body })).await,
        Err(r) => *r,
    }
}

// ---------------- POST /tasks/cancel ----------------

#[utoipa::path(
    post,
    path = "/tasks/cancel",
    tag = "tasks",
    responses(
        (status = 204, description = "Tarefa cancelada e removida"),
        (status = 404, description = "Nenhuma tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn post_cancel(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "tasks.cancel", json!({})).await
}

// ---------------- GET /projects ----------------

#[utoipa::path(
    get,
    path = "/projects",
    tag = "catalog",
    params(
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Projetos do workspace", body = Vec<ProjectDto>)
    )
)]
pub async fn get_projects(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(
        &state,
        "projects.list",
        json!({ "workspaceId": q.workspace_id }),
    )
    .await
}

// ---------------- GET /categories ----------------

#[utoipa::path(
    get,
    path = "/categories",
    tag = "catalog",
    params(
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Categorias do workspace", body = Vec<CategoryDto>)
    )
)]
pub async fn get_categories(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(
        &state,
        "categories.list",
        json!({ "workspaceId": q.workspace_id }),
    )
    .await
}

// ================================================================
// Planned tasks
// ================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTasksQuery {
    date: Option<String>,
    workspace_id: Option<String>,
}

#[utoipa::path(
    get,
    path = "/planned-tasks",
    tag = "planned-tasks",
    params(
        ("date" = Option<String>, Query, description = "Filtrar por data YYYY-MM-DD (aplica recorrência e período aberto). Se omitido, retorna todas."),
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Lista de tarefas planejadas", body = Vec<PlannedTaskDto>)
    )
)]
pub async fn get_planned_tasks(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<PlannedTasksQuery>,
) -> Response {
    forward(
        &state,
        "plannedTasks.list",
        json!({ "date": q.date, "workspaceId": q.workspace_id }),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/planned-tasks/{id}",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    responses(
        (status = 200, description = "Tarefa planejada", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn get_planned_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "plannedTasks.get", json!({ "id": id })).await
}

#[utoipa::path(
    post,
    path = "/planned-tasks",
    tag = "planned-tasks",
    request_body(
        content = CreatePlannedTaskRequest,
        description = "Dados da nova tarefa planejada.",
        example = json!({
            "name": "Daily standup",
            "categoryName": "Reuniões",
            "billable": false,
            "scheduleType": "recurring",
            "recurringDays": [1, 2, 3, 4, 5]
        })
    ),
    responses(
        (status = 201, description = "Tarefa planejada criada", body = PlannedTaskDto),
        (status = 409, description = "Workspace, projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn post_planned_task(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    match parse_body::<CreatePlannedTaskRequest>(&body, true) {
        Ok(body) => forward(&state, "plannedTasks.create", json!({ "body": body })).await,
        Err(r) => *r,
    }
}

#[utoipa::path(
    put,
    path = "/planned-tasks/{id}",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    request_body(
        content = UpdatePlannedTaskRequest,
        description = "Substitui os campos atualizáveis da tarefa planejada. `completedDates` é preservado; \
            `sortOrder`, `startTime`, `endTime` e `customValues` ausentes também; \
            `null` em `startTime`, `endTime` ou `customValues` limpa o campo.",
        example = json!({
            "name": "Daily standup",
            "billable": false,
            "scheduleType": "recurring",
            "recurringDays": [1, 2, 3, 4, 5],
            "actions": []
        })
    ),
    responses(
        (status = 200, description = "Tarefa planejada atualizada", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse),
        (status = 409, description = "Projeto/categoria não encontrado no workspace da tarefa", body = ErrorResponse)
    )
)]
pub async fn put_planned_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    match parse_body::<UpdatePlannedTaskRequest>(&body, true) {
        Ok(body) => {
            forward(
                &state,
                "plannedTasks.update",
                json!({ "id": id, "body": body }),
            )
            .await
        }
        Err(r) => *r,
    }
}

#[utoipa::path(
    delete,
    path = "/planned-tasks/{id}",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    responses(
        (status = 204, description = "Tarefa planejada removida"),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn delete_planned_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "plannedTasks.delete", json!({ "id": id })).await
}

#[utoipa::path(
    post,
    path = "/planned-tasks/{id}/complete",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    request_body(
        content = PlannedTaskCompleteRequest,
        description = "Data a marcar como concluída. Se omitida, usa hoje.",
        example = json!({ "date": "2026-04-18" })
    ),
    responses(
        (status = 200, description = "Tarefa marcada como concluída", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn post_planned_task_complete(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    match parse_body::<PlannedTaskCompleteRequest>(&body, false) {
        Ok(body) => {
            forward(
                &state,
                "plannedTasks.complete",
                json!({ "id": id, "body": body }),
            )
            .await
        }
        Err(r) => *r,
    }
}

#[utoipa::path(
    delete,
    path = "/planned-tasks/{id}/complete/{date}",
    tag = "planned-tasks",
    params(
        ("id" = String, Path, description = "ID da tarefa planejada"),
        ("date" = String, Path, description = "Data a desmarcar (YYYY-MM-DD)")
    ),
    responses(
        (status = 200, description = "Conclusão removida", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn delete_planned_task_complete(
    State(state): State<Arc<ApiState>>,
    Path((id, date)): Path<(String, String)>,
) -> Response {
    forward(
        &state,
        "plannedTasks.uncomplete",
        json!({ "id": id, "date": date }),
    )
    .await
}

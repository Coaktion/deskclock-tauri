//! Histórico (tarefas concluídas) e edição da tarefa ativa. Só repassam à
//! janela principal.

use super::{forward, forward_with_body};
use crate::api::models::{
    CreateTaskRequest, ErrorResponse, MoveTasksRequest, MoveTasksResponse, SetTaskBillableRequest,
    TaskDto, TaskIdsRequest, UpdateActiveTaskRequest, UpdateTaskRequest,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    response::Response,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksQuery {
    from: Option<String>,
    to: Option<String>,
    name: Option<String>,
    project_id: Option<String>,
    category_id: Option<String>,
    // Texto e não `bool`: o erro de formato sai em JSON pelo TS, como os demais.
    billable: Option<String>,
    workspace_id: Option<String>,
}

// ---------------- PATCH /tasks/active ----------------

#[utoipa::path(
    patch,
    path = "/tasks/active",
    tag = "tasks",
    request_body(
        content = UpdateActiveTaskRequest,
        description = "Edita a tarefa em execução ou pausada. Campos ausentes são preservados; `null` limpa nome, \
            projeto e categoria. Projeto e categoria são resolvidos no workspace da tarefa. \
            Trocar a categoria sem enviar `billable` aplica o `defaultBillable` da nova; `billable` enviado sempre vence. \
            A edição também é levada à tarefa planejada de origem, como na tela.",
        example = json!({ "name": "Revisão de código", "categoryName": "Desenvolvimento", "billable": true })
    ),
    responses(
        (status = 200, description = "Tarefa ativa atualizada", body = TaskDto),
        (status = 400, description = "`startTime` inválido ou no futuro", body = ErrorResponse),
        (status = 404, description = "Nenhuma tarefa ativa", body = ErrorResponse),
        (status = 409, description = "Projeto ou categoria não encontrado no workspace da tarefa", body = ErrorResponse)
    )
)]
pub async fn patch_active_task(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<UpdateActiveTaskRequest>(
        &state,
        "tasks.updateActive",
        &body,
        true,
        json!({}),
    )
    .await
}

// ---------------- GET/POST /tasks ----------------

#[utoipa::path(
    get,
    path = "/tasks",
    tag = "history",
    params(
        ("from" = Option<String>, Query, description = "Primeiro dia local, YYYY-MM-DD. Ausente = hoje."),
        ("to" = Option<String>, Query, description = "Último dia local, YYYY-MM-DD. Ausente = o mesmo de `from`."),
        ("name" = Option<String>, Query, description = "Trecho do nome, sem diferenciar maiúsculas."),
        ("projectId" = Option<String>, Query, description = "Só tarefas deste projeto."),
        ("categoryId" = Option<String>, Query, description = "Só tarefas desta categoria."),
        ("billable" = Option<String>, Query, description = "`true` ou `false`."),
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Tarefas concluídas do período, da mais recente para a mais antiga", body = Vec<TaskDto>),
        (status = 400, description = "Data ou `billable` fora do formato, ou `from` depois de `to`", body = ErrorResponse),
        (status = 409, description = "Workspace, projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn get_tasks(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<TasksQuery>,
) -> Response {
    forward(
        &state,
        "history.list",
        json!({
            "from": q.from,
            "to": q.to,
            "name": q.name,
            "projectId": q.project_id,
            "categoryId": q.category_id,
            "billable": q.billable,
            "workspaceId": q.workspace_id,
        }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/tasks",
    tag = "history",
    request_body(
        content = CreateTaskRequest,
        description = "Lançamento retroativo: grava uma tarefa já concluída. Duração = fim − início, mínimo de 1 minuto.",
        example = json!({
            "name": "Reunião com cliente",
            "projectName": "Cliente ACME",
            "categoryName": "Reuniões",
            "billable": true,
            "startTime": "2026-09-15T09:00:00-03:00",
            "endTime": "2026-09-15T10:30:00-03:00"
        })
    ),
    responses(
        (status = 201, description = "Tarefa lançada", body = TaskDto),
        (status = 400, description = "Instante inválido ou duração menor que 1 minuto", body = ErrorResponse),
        (status = 409, description = "Workspace, projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn post_task(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CreateTaskRequest>(&state, "history.create", &body, true, json!({})).await
}

// ---------------- /tasks/{id} ----------------

#[utoipa::path(
    get,
    path = "/tasks/{id}",
    tag = "history",
    params(("id" = String, Path, description = "ID da tarefa")),
    responses(
        (status = 200, description = "Tarefa, de qualquer workspace e status", body = TaskDto),
        (status = 404, description = "Tarefa não encontrada", body = ErrorResponse)
    )
)]
pub async fn get_task(State(state): State<Arc<ApiState>>, Path(id): Path<String>) -> Response {
    forward(&state, "history.get", json!({ "id": id })).await
}

#[utoipa::path(
    put,
    path = "/tasks/{id}",
    tag = "history",
    params(("id" = String, Path, description = "ID da tarefa concluída")),
    request_body(
        content = UpdateTaskRequest,
        description = "Edição parcial: ausente preserva; `null` limpa nome, projeto, categoria e campos personalizados, \
            e é recusado (400) em `startTime`/`endTime`. Projeto e categoria são resolvidos no workspace da tarefa. \
            Informar início ou fim recalcula a duração. \
            Trocar a categoria sem enviar `billable` aplica o `defaultBillable` da nova; `billable` enviado sempre vence. \
            O faturamento resultante vale para o grupo da tarefa \
            (mesmo dia, nome, projeto, categoria e campos personalizados), como no modal de edição.",
        example = json!({ "name": "Reunião de kickoff", "billable": false, "endTime": "2026-09-15T11:00:00-03:00" })
    ),
    responses(
        (status = 200, description = "Tarefa atualizada", body = TaskDto),
        (status = 400, description = "Instante inválido ou `null`, ou fim antes do início", body = ErrorResponse),
        (status = 404, description = "Tarefa não encontrada", body = ErrorResponse),
        (status = 409, description = "Tarefa em execução ou pausada (use PATCH /tasks/active), ou projeto/categoria não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<UpdateTaskRequest>(
        &state,
        "history.update",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/tasks/{id}",
    tag = "history",
    params(("id" = String, Path, description = "ID da tarefa concluída")),
    responses(
        (status = 204, description = "Tarefa excluída, sem confirmação"),
        (status = 404, description = "Tarefa não encontrada", body = ErrorResponse),
        (status = 409, description = "Tarefa em execução ou pausada (use POST /tasks/cancel)", body = ErrorResponse)
    )
)]
pub async fn delete_task(State(state): State<Arc<ApiState>>, Path(id): Path<String>) -> Response {
    forward(&state, "history.delete", json!({ "id": id })).await
}

#[utoipa::path(
    put,
    path = "/tasks/{id}/billable",
    tag = "history",
    params(("id" = String, Path, description = "ID da tarefa concluída")),
    request_body(
        content = SetTaskBillableRequest,
        description = "Define o faturamento da tarefa e das irmãs do grupo dela no mesmo dia e workspace.",
        example = json!({ "billable": false })
    ),
    responses(
        (status = 200, description = "Tarefa atualizada", body = TaskDto),
        (status = 400, description = "`billable` ausente ou não booleano", body = ErrorResponse),
        (status = 404, description = "Tarefa não encontrada", body = ErrorResponse),
        (status = 409, description = "Tarefa em execução ou pausada", body = ErrorResponse)
    )
)]
pub async fn put_task_billable(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<SetTaskBillableRequest>(
        &state,
        "history.setBillable",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

// ---------------- Lotes ----------------

#[utoipa::path(
    post,
    path = "/tasks/delete",
    tag = "history",
    request_body(
        content = TaskIdsRequest,
        description = "Exclui várias tarefas concluídas. Se algum id não existir ou estiver ativo, nada é excluído.",
        example = json!({ "ids": ["t1…", "t2…"] })
    ),
    responses(
        (status = 204, description = "Tarefas excluídas"),
        (status = 400, description = "`ids` vazio", body = ErrorResponse),
        (status = 404, description = "Algum id não existe", body = ErrorResponse),
        (status = 409, description = "Alguma tarefa em execução ou pausada", body = ErrorResponse)
    )
)]
pub async fn post_tasks_delete(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<TaskIdsRequest>(&state, "history.deleteMany", &body, true, json!({})).await
}

#[utoipa::path(
    post,
    path = "/tasks/merge",
    tag = "history",
    request_body(
        content = TaskIdsRequest,
        description = "Unifica um grupo num registro só, com a duração somada; os originais são excluídos. \
            O registro começa no início mais cedo e termina no maior fim do grupo. \
            Só vale para as tarefas de hoje. As tarefas precisam ser do mesmo dia e workspace, com nome, projeto, categoria e campos personalizados iguais.",
        example = json!({ "ids": ["t1…", "t2…"] })
    ),
    responses(
        (status = 201, description = "Registro unificado", body = TaskDto),
        (status = 400, description = "`ids` vazio ou menos de duas tarefas", body = ErrorResponse),
        (status = 404, description = "Algum id não existe", body = ErrorResponse),
        (status = 409, description = "As tarefas não formam um grupo, não são de hoje, ou alguma está ativa", body = ErrorResponse)
    )
)]
pub async fn post_tasks_merge(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<TaskIdsRequest>(&state, "history.merge", &body, true, json!({})).await
}

#[utoipa::path(
    post,
    path = "/tasks/move",
    tag = "history",
    request_body(
        content = MoveTasksRequest,
        description = "Move ou copia tarefas concluídas para outro workspace. Projeto e categoria não atravessam: \
            para cada um, `kind` = `match` (usa `targetId` do destino), `create` (cria `name` no destino) ou `unset`.",
        example = json!({
            "ids": ["t1…"],
            "toWorkspaceId": "00000000-0000-4000-8000-000000000001",
            "project": { "kind": "create", "name": "Cliente ACME" },
            "category": { "kind": "unset" },
            "mode": "move"
        })
    ),
    responses(
        (status = 200, description = "Quantidade de tarefas movidas ou copiadas", body = MoveTasksResponse,
            example = json!({ "count": 1 })),
        (status = 400, description = "`ids` vazio, `mode` ou `kind` inválido, ou destino igual à origem", body = ErrorResponse),
        (status = 404, description = "Algum id não existe", body = ErrorResponse),
        (status = 409, description = "Destino ou `targetId` não encontrado, ou alguma tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn post_tasks_move(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<MoveTasksRequest>(&state, "history.move", &body, true, json!({})).await
}

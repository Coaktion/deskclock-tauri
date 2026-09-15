//! Workspaces e workspace ativo. Só repassam à janela principal.

use super::{forward, forward_with_body};
use crate::api::models::{
    CreateWorkspaceRequest, DeleteWorkspaceRequest, ErrorResponse, SetActiveWorkspaceRequest,
    UpdateWorkspaceRequest, WorkspaceDto,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Path, State},
    response::Response,
};
use serde_json::json;
use std::sync::Arc;

#[utoipa::path(
    get,
    path = "/workspaces",
    tag = "workspaces",
    responses(
        (status = 200, description = "Todos os workspaces; `active` marca o ativo", body = Vec<WorkspaceDto>,
            example = json!([{ "id": "00000000-0000-4000-8000-000000000001", "name": "Padrão", "color": "teal", "createdAt": "2026-08-01T12:00:00.000Z", "active": true }]))
    )
)]
pub async fn get_workspaces(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "workspaces.list", json!({})).await
}

#[utoipa::path(
    post,
    path = "/workspaces",
    tag = "workspaces",
    request_body(
        content = CreateWorkspaceRequest,
        description = "Novo workspace. `color` é um slot da paleta: rose, orange, amber, lime, teal, cyan, violet, fuchsia. \
            Ausente = derivada do nome.",
        example = json!({ "name": "Freelas", "color": "violet" })
    ),
    responses(
        (status = 201, description = "Workspace criado", body = WorkspaceDto),
        (status = 400, description = "Nome vazio ou cor fora da paleta", body = ErrorResponse),
        (status = 409, description = "Nome já existe", body = ErrorResponse)
    )
)]
pub async fn post_workspace(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CreateWorkspaceRequest>(&state, "workspaces.create", &body, true, json!({}))
        .await
}

#[utoipa::path(
    put,
    path = "/workspaces/{id}",
    tag = "workspaces",
    params(("id" = String, Path, description = "ID do workspace")),
    request_body(
        content = UpdateWorkspaceRequest,
        description = "Renomeia e/ou recolore. `color` ausente preserva a cor atual.",
        example = json!({ "name": "Freelas 2026", "color": "violet" })
    ),
    responses(
        (status = 200, description = "Workspace atualizado", body = WorkspaceDto),
        (status = 400, description = "Nome vazio ou cor fora da paleta", body = ErrorResponse),
        (status = 404, description = "Workspace não encontrado", body = ErrorResponse),
        (status = 409, description = "Nome já existe", body = ErrorResponse)
    )
)]
pub async fn put_workspace(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<UpdateWorkspaceRequest>(
        &state,
        "workspaces.update",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/workspaces/{id}",
    tag = "workspaces",
    params(("id" = String, Path, description = "ID do workspace")),
    request_body(
        content = DeleteWorkspaceRequest,
        description = "Destino obrigatório dos dados: `move` reatribui tarefas, planejadas, projetos, categorias e perfis \
            a `toWorkspaceId`; `delete` apaga tudo, sem desfazer. Excluir o ativo troca para o destino (ou o primeiro restante).",
        example = json!({ "mode": "move", "toWorkspaceId": "00000000-0000-4000-8000-000000000001" })
    ),
    responses(
        (status = 204, description = "Workspace excluído"),
        (status = 400, description = "`mode` inválido, `toWorkspaceId` ausente ou igual ao excluído", body = ErrorResponse),
        (status = 404, description = "Workspace não encontrado", body = ErrorResponse),
        (status = 409, description = "Último workspace, destino inexistente, ou tarefa ativa neste workspace", body = ErrorResponse)
    )
)]
pub async fn delete_workspace(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<DeleteWorkspaceRequest>(
        &state,
        "workspaces.delete",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/workspaces/active",
    tag = "workspaces",
    responses(
        (status = 200, description = "Workspace ativo", body = WorkspaceDto,
            example = json!({ "id": "00000000-0000-4000-8000-000000000001", "name": "Padrão", "color": "teal", "createdAt": "2026-08-01T12:00:00.000Z", "active": true }))
    )
)]
pub async fn get_active_workspace(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "workspaces.getActive", json!({})).await
}

#[utoipa::path(
    put,
    path = "/workspaces/active",
    tag = "workspaces",
    request_body(
        content = SetActiveWorkspaceRequest,
        description = "Troca o workspace ativo em todas as janelas. Com tarefa ativa (em execução ou pausada) a troca é recusada — \
            pare ou cancele a tarefa antes.",
        example = json!({ "id": "00000000-0000-4000-8000-000000000001" })
    ),
    responses(
        (status = 200, description = "Workspace ativo depois da troca", body = WorkspaceDto),
        (status = 400, description = "id ausente ou vazio", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado, ou há tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn put_active_workspace(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<SetActiveWorkspaceRequest>(
        &state,
        "workspaces.setActive",
        &body,
        true,
        json!({}),
    )
    .await
}

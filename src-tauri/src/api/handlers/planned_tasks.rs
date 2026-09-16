//! Ações sobre uma planejada além do CRUD: duplicar, iniciar e lançar
//! retroativo. Só repassam à janela principal.

use super::{forward, forward_with_body};
use crate::api::models::{
    ErrorResponse, LaunchPlannedTaskRetroactiveRequest, PlannedTaskDto, TaskDto,
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
    post,
    path = "/planned-tasks/{id}/duplicate",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    responses(
        (status = 201, description = "Cópia criada no mesmo workspace, sem as datas concluídas, como o botão Duplicar", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn post_planned_task_duplicate(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "plannedTasks.duplicate", json!({ "id": id })).await
}

#[utoipa::path(
    post,
    path = "/planned-tasks/{id}/start",
    tag = "tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada, de qualquer workspace")),
    responses(
        (status = 201, description = "Tarefa iniciada no workspace da planejada, com nome, projeto, categoria, faturamento e campos personalizados dela. \
            Parar a tarefa conclui a planejada no dia, como o Play das telas.", body = TaskDto),
        (status = 404, description = "Planejada não encontrada", body = ErrorResponse),
        (status = 409, description = "Já existe tarefa em execução ou pausada", body = ErrorResponse)
    )
)]
pub async fn post_planned_task_start(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "tasks.startPlanned", json!({ "id": id })).await
}

#[utoipa::path(
    post,
    path = "/planned-tasks/{id}/launch-retroactive",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada, de qualquer workspace")),
    request_body(
        content = LaunchPlannedTaskRetroactiveRequest,
        description = "Lança a planejada como tarefa concluída do dia e a marca como concluída nele, como a tela de Lançamento Manual. \
            Planejada com horário usa o horário dela (fim antes do início cruza a meia-noite) e recusa `startTime`/`endTime`. \
            Planejada sem horário exige `startTime` e `endTime`, com mínimo de 1 minuto. Corpo opcional.",
        example = json!({ "date": "2026-09-15", "startTime": "2026-09-15T09:00:00-03:00", "endTime": "2026-09-15T10:00:00-03:00" })
    ),
    responses(
        (status = 201, description = "Tarefa lançada", body = TaskDto),
        (status = 400, description = "Data inválida ou futura, instante inválido, horário ausente ou sobrando, ou duração menor que 1 minuto", body = ErrorResponse),
        (status = 404, description = "Planejada não encontrada", body = ErrorResponse),
        (status = 409, description = "Planejada não agendada para a data ou já concluída nela", body = ErrorResponse)
    )
)]
pub async fn post_planned_task_launch_retroactive(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<LaunchPlannedTaskRetroactiveRequest>(
        &state,
        "plannedTasks.launchRetroactive",
        &body,
        false,
        json!({ "id": id }),
    )
    .await
}

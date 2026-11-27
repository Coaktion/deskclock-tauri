//! Fase D2b da paridade: a escrita nos lançamentos — criar, editar e excluir
//! apontamentos do Clockify; editar e excluir atividades do Monday. Só repassam à
//! janela principal; a regra é a dos formulários dos modais, no TS.

use super::{forward, forward_with_body};
use crate::api::models::{
    ClockifyEntryWriteRequest, ClockifyWrittenEntryDto, ErrorResponse, MondayEntryDto,
    MondayEntryUpdateRequest,
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
    path = "/integrations/clockify/entries",
    tag = "integrations",
    request_body(
        content = ClockifyEntryWriteRequest,
        description = "O \"Novo apontamento\" de \"Apontamentos do Clockify\". Tags ausentes = as tags padrão; \
            `billable` ausente = `false`, como o formulário abre.",
        example = json!({ "description": "Revisão do layout", "projectName": "ACME - Site", "date": "2026-09-15", "start": "09:00", "end": "10:30" })
    ),
    responses(
        (status = 201, description = "Apontamento criado no workspace do Clockify configurado", body = ClockifyWrittenEntryDto),
        (status = 400, description = "Descrição vazia, sem projeto, ou data/hora fora do formato", body = ErrorResponse),
        (status = 409, description = "Clockify não configurado, ou projeto/tag que não existe no workspace do Clockify", body = ErrorResponse)
    )
)]
pub async fn post_clockify_entry(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ClockifyEntryWriteRequest>(
        &state,
        "clockify.createEntry",
        &body,
        true,
        json!({}),
    )
    .await
}

#[utoipa::path(
    put,
    path = "/integrations/clockify/entries/{id}",
    tag = "integrations",
    params(("id" = String, Path, description = "Id do apontamento, de `GET /integrations/clockify/entries`")),
    request_body(
        content = ClockifyEntryWriteRequest,
        description = "Regrava o apontamento inteiro, como o Salvar do formulário: `billable` e as tags \
            (`tagIds` ou `tagNames`; lista vazia = sem tags) são obrigatórios."
    ),
    responses(
        (status = 200, description = "Apontamento regravado", body = ClockifyWrittenEntryDto),
        (status = 400, description = "Descrição vazia, sem projeto, sem `billable` ou sem as tags, ou data/hora fora do formato", body = ErrorResponse),
        (status = 409, description = "Clockify não configurado, ou projeto/tag que não existe no workspace do Clockify", body = ErrorResponse)
    )
)]
pub async fn put_clockify_entry(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<ClockifyEntryWriteRequest>(
        &state,
        "clockify.updateEntry",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/integrations/clockify/entries/{id}",
    tag = "integrations",
    params(("id" = String, Path, description = "Id do apontamento, de `GET /integrations/clockify/entries`")),
    responses(
        (status = 204, description = "Apontamento excluído do Clockify, na hora e sem desfazer, como a lixeira da linha"),
        (status = 409, description = "Clockify não configurado", body = ErrorResponse)
    )
)]
pub async fn delete_clockify_entry(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "clockify.deleteEntry", json!({ "id": id })).await
}

#[utoipa::path(
    put,
    path = "/integrations/monday/entries/{id}",
    tag = "integrations",
    params(("id" = String, Path, description = "`itemId` da atividade, de `GET /integrations/monday/entries`")),
    request_body(
        content = MondayEntryUpdateRequest,
        description = "O lápis de \"Atividades no Monday\". Ausente = o valor atual. As datas não se editam: vêm da tarefa \
            no DeskClock.",
        example = json!({ "hours": 2.5, "activityType": "Development" })
    ),
    responses(
        (status = 200, description = "A atividade como ficou no board", body = MondayEntryDto),
        (status = 400, description = "Nome vazio, horas negativas, rótulo que o board não oferece ou faturável em board \
            sem a coluna Billing type", body = ErrorResponse),
        (status = 404, description = "A atividade não está entre as suas nos boards vinculados", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, sem o usuário da conta ou sem projeto com board", body = ErrorResponse)
    )
)]
pub async fn put_monday_entry(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<MondayEntryUpdateRequest>(
        &state,
        "monday.updateEntry",
        &body,
        false,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/integrations/monday/entries/{id}",
    tag = "integrations",
    params(("id" = String, Path, description = "`itemId` da atividade, de `GET /integrations/monday/entries`")),
    responses(
        (status = 204, description = "Atividade excluída do board e do rastreio local, sem desfazer. A tela pede \
            confirmação antes; a API não pergunta"),
        (status = 404, description = "A atividade não está entre as suas nos boards vinculados", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, sem o usuário da conta ou sem projeto com board", body = ErrorResponse)
    )
)]
pub async fn delete_monday_entry(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "monday.deleteEntry", json!({ "id": id })).await
}

//! Campos personalizados — globais, sem workspace. Só repassam à janela principal.

use super::{forward, forward_with_body};
use crate::api::models::{
    CreateCustomFieldRequest, CustomFieldDto, ErrorResponse, UpdateCustomFieldRequest,
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
    path = "/custom-fields",
    tag = "custom-fields",
    responses(
        (status = 200, description = "Todos os campos, inclusive arquivados", body = Vec<CustomFieldDto>,
            example = json!([{ "id": "f1…", "label": "Etapa", "type": "select", "options": [{ "id": "o1…", "label": "Discovery" }], "sortOrder": 0, "archived": false, "createdAt": "2026-09-15T13:00:00.000Z" }]))
    )
)]
pub async fn get_custom_fields(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "customFields.list", json!({})).await
}

#[utoipa::path(
    post,
    path = "/custom-fields",
    tag = "custom-fields",
    request_body(
        content = CreateCustomFieldRequest,
        description = "`type`: text, multiline, select ou checkbox. `optionLabels` só vale para select, que exige ao menos uma opção.",
        example = json!({ "label": "Etapa", "type": "select", "optionLabels": ["Discovery", "Entrega"] })
    ),
    responses(
        (status = 201, description = "Campo criado", body = CustomFieldDto),
        (status = 400, description = "Rótulo vazio, tipo inválido ou select sem opção", body = ErrorResponse),
        (status = 409, description = "Rótulo já existe", body = ErrorResponse)
    )
)]
pub async fn post_custom_field(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CreateCustomFieldRequest>(
        &state,
        "customFields.create",
        &body,
        true,
        json!({}),
    )
    .await
}

#[utoipa::path(
    put,
    path = "/custom-fields/{id}",
    tag = "custom-fields",
    params(("id" = String, Path, description = "ID do campo")),
    request_body(
        content = UpdateCustomFieldRequest,
        description = "Campos ausentes são preservados. `optionLabels` é a lista final, na ordem: opções com o mesmo rótulo \
            mantêm o id, e com ele os valores já gravados nas tarefas.",
        example = json!({ "optionLabels": ["Discovery", "Entrega", "Suporte"], "archived": false })
    ),
    responses(
        (status = 200, description = "Campo atualizado", body = CustomFieldDto),
        (status = 400, description = "Rótulo vazio ou select sem opção", body = ErrorResponse),
        (status = 404, description = "Campo não encontrado", body = ErrorResponse),
        (status = 409, description = "Rótulo já existe", body = ErrorResponse)
    )
)]
pub async fn put_custom_field(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<UpdateCustomFieldRequest>(
        &state,
        "customFields.update",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/custom-fields/{id}",
    tag = "custom-fields",
    params(("id" = String, Path, description = "ID do campo")),
    responses(
        (status = 204, description = "Campo excluído, junto com os valores gravados nas tarefas"),
        (status = 404, description = "Campo não encontrado", body = ErrorResponse)
    )
)]
pub async fn delete_custom_field(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "customFields.delete", json!({ "id": id })).await
}

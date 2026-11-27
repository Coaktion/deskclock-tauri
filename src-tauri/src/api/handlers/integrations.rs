//! Envio manual de tarefas às integrações (Google Sheets, Clockify, Monday):
//! prévia e envio. Só repassam à janela principal.

use super::{forward, forward_with_body};
use crate::api::models::{ErrorResponse, SendPreviewDto, SendTasksRequest, SendTasksResponse};
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
pub struct SendPreviewQuery {
    from: Option<String>,
    to: Option<String>,
}

#[utoipa::path(
    get,
    path = "/integrations/{id}/send-preview",
    tag = "integrations",
    params(
        ("id" = String, Path, description = "`google_sheets`, `clockify` ou `monday`."),
        ("from" = Option<String>, Query, description = "Primeiro dia local, YYYY-MM-DD. Ausente = hoje."),
        ("to" = Option<String>, Query, description = "Último dia local, YYYY-MM-DD. Ausente = o mesmo de `from`.")
    ),
    responses(
        (status = 200, description = "Tarefas concluídas do período no workspace da integração, por dia e grupo, \
            com o estado de cada grupo — a lista do modal Enviar", body = SendPreviewDto),
        (status = 400, description = "Data fora do formato, ou `from` depois de `to`", body = ErrorResponse),
        (status = 404, description = "Integração desconhecida", body = ErrorResponse),
        (status = 409, description = "Integração não configurada", body = ErrorResponse)
    )
)]
pub async fn get_send_preview(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<SendPreviewQuery>,
) -> Response {
    forward(
        &state,
        "integrations.sendPreview",
        json!({ "id": id, "from": q.from, "to": q.to }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/integrations/{id}/send",
    tag = "integrations",
    params(("id" = String, Path, description = "`google_sheets`, `clockify` ou `monday`.")),
    request_body(
        content = SendTasksRequest,
        description = "Envia os grupos das tarefas indicadas, como o botão Enviar do modal. Cada id envia o grupo \
            inteiro do dia dele. Reenviar o que já foi enviado é permitido (veja `resendWarning` da prévia). \
            Marca como enviado o que o destino confirmou e, sem recusa nem falha, avança o último envio diário.",
        example = json!({ "taskIds": ["9b2c…", "41fe…"] })
    ),
    responses(
        (status = 200, description = "Resultado do envio; recusa e falha por grupo vêm no corpo", body = SendTasksResponse),
        (status = 400, description = "`taskIds` vazio ou fora do formato", body = ErrorResponse),
        (status = 404, description = "Integração ou tarefa não encontrada", body = ErrorResponse),
        (status = 409, description = "Integração não configurada; tarefa ativa ou fora do workspace da integração; \
            grupo com dado faltando; ou a validação antes do envio barrou (ex.: projeto sem board no Monday)", body = ErrorResponse)
    )
)]
pub async fn post_send(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<SendTasksRequest>(
        &state,
        "integrations.send",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

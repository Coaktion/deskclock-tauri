//! Fase D3a da paridade: o link de compartilhar tarefa (`deskclock://task/share`).
//! Gerar o link de uma planejada, como o "Copiar link"; e a prévia e a ação do
//! modal "Tarefa recebida por link". O contrato do link é do TS.

use super::forward_with_body;
use crate::api::models::{
    ErrorResponse, ShareApplyRequest, ShareApplyResponse, ShareLinkRequest, ShareLinkResponse,
    SharePreviewRequest, SharePreviewResponse,
};
use crate::api::state::ApiState;
use axum::{body::Bytes, extract::State, response::Response};
use serde_json::json;
use std::sync::Arc;

#[utoipa::path(
    post,
    path = "/share/link",
    tag = "share",
    request_body(content = ShareLinkRequest, example = json!({ "plannedTaskId": "p-1" })),
    responses(
        (status = 200, description = "O link e exatamente o que viaja nele: nome, projeto e categoria por nome, \
            billable, horário e campos pelo rótulo. Agendamento, ações, data e ids não viajam", body = ShareLinkResponse),
        (status = 400, description = "Sem `plannedTaskId`", body = ErrorResponse),
        (status = 404, description = "Planejada não encontrada", body = ErrorResponse)
    )
)]
pub async fn post_share_link(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ShareLinkRequest>(&state, "share.link", &body, true, json!({})).await
}

#[utoipa::path(
    post,
    path = "/share/preview",
    tag = "share",
    request_body(content = SharePreviewRequest, example = json!({ "link": "deskclock://task/share?name=Revisar%20PR" })),
    responses(
        (status = 200, description = "O que o modal abriria, sem gravar nada: a tarefa resolvida contra os catálogos \
            do workspace, o que não casou, e o aviso se há tarefa ativa", body = SharePreviewResponse),
        (status = 400, description = "Link inválido (a mensagem do campo \"Receber link\") ou que não é de tarefa \
            compartilhada", body = ErrorResponse),
        (status = 409, description = "Workspace inexistente", body = ErrorResponse)
    )
)]
pub async fn post_share_preview(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<SharePreviewRequest>(&state, "share.preview", &body, true, json!({})).await
}

#[utoipa::path(
    post,
    path = "/share/apply",
    tag = "share",
    request_body(
        content = ShareApplyRequest,
        description = "`plan` = \"Adicionar como planejada\" (data específica, `date` ou hoje); `start` = \"Iniciar \
            agora\", que encerra a tarefa ativa pelas regras de parada. Grava o que o link resolveu; nada é criado no \
            catálogo.",
        example = json!({ "link": "deskclock://task/share?name=Revisar%20PR", "mode": "plan", "date": "2026-09-20" })
    ),
    responses(
        (status = 201, description = "A planejada criada ou a tarefa iniciada, e o que não casou", body = ShareApplyResponse),
        (status = 400, description = "Link inválido, `mode` fora de plan/start, `date` fora do formato ou em `start`", body = ErrorResponse),
        (status = 409, description = "Workspace inexistente, ou outro início em curso", body = ErrorResponse)
    )
)]
pub async fn post_share_apply(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ShareApplyRequest>(&state, "share.apply", &body, true, json!({})).await
}

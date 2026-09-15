//! Totais por período e por semana. Só repassam à janela principal.

use super::forward;
use crate::api::models::{ErrorResponse, PeriodTotalsDto, WeekTotalsDto};
use crate::api::state::ApiState;
use axum::{
    extract::{Query, State},
    response::Response,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodQuery {
    from: Option<String>,
    to: Option<String>,
    workspace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekQuery {
    date: Option<String>,
    workspace_id: Option<String>,
}

#[utoipa::path(
    get,
    path = "/totals",
    tag = "totals",
    params(
        ("from" = Option<String>, Query, description = "Primeiro dia local, YYYY-MM-DD. Ausente = hoje."),
        ("to" = Option<String>, Query, description = "Último dia local, YYYY-MM-DD. Ausente = o mesmo de `from`."),
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Totais das tarefas concluídas no período, como no Histórico", body = PeriodTotalsDto,
            example = json!({ "from": "2026-09-01", "to": "2026-09-15", "totalSeconds": 144000, "billableSeconds": 120000, "nonBillableSeconds": 24000, "count": 37 })),
        (status = 400, description = "Data fora do formato, ou `from` depois de `to`", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn get_totals(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<PeriodQuery>,
) -> Response {
    forward(
        &state,
        "totals.period",
        json!({ "from": q.from, "to": q.to, "workspaceId": q.workspace_id }),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/totals/week",
    tag = "totals",
    params(
        ("date" = Option<String>, Query, description = "Qualquer dia da semana, YYYY-MM-DD. Ausente = hoje. A semana vai de segunda a domingo."),
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Total da semana, como na tela de Tarefas", body = WeekTotalsDto,
            example = json!({ "weekStart": "2026-09-14", "weekEnd": "2026-09-20", "totalSeconds": 28800, "daysWorked": 2 })),
        (status = 400, description = "Data fora do formato", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn get_week_totals(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<WeekQuery>,
) -> Response {
    forward(
        &state,
        "totals.week",
        json!({ "date": q.date, "workspaceId": q.workspace_id }),
    )
    .await
}

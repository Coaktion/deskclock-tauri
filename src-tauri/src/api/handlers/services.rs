//! Fase D2 da paridade: os lançamentos já feitos no Clockify e no Monday
//! (leitura), o resumo do dia por IA e o backup no Drive. Só repassam à janela
//! principal.

use super::{forward, forward_with_body};
use crate::api::models::{
    ClockifyEntriesDto, DaySummariesDto, DriveBackupRunResponse, DriveBackupStatusDto,
    ErrorResponse, GenerateDaySummariesRequest, GenerateDaySummariesResponse, MondayEntriesDto,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Query, State},
    response::Response,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyEntriesQuery {
    from: Option<String>,
    to: Option<String>,
    only_default_tags: Option<String>,
}

#[utoipa::path(
    get,
    path = "/integrations/clockify/entries",
    tag = "integrations",
    params(
        ("from" = Option<String>, Query, description = "Primeiro dia local, YYYY-MM-DD. Ausente = hoje (o \"Hoje\" do modal)."),
        ("to" = Option<String>, Query, description = "Último dia local, YYYY-MM-DD. Ausente = `from`."),
        ("onlyDefaultTags" = Option<String>, Query, description = "`true`/`false`: só os apontamentos com todas as tags padrão. \
            Ausente = ligado quando há tags padrão, como o modal abre.")
    ),
    responses(
        (status = 200, description = "Os apontamentos do usuário no workspace do Clockify configurado, por dia, como \
            \"Apontamentos do Clockify\" os mostra; o apontamento em andamento fica de fora", body = ClockifyEntriesDto),
        (status = 400, description = "Data ou `onlyDefaultTags` fora do formato, ou `from` depois de `to`", body = ErrorResponse),
        (status = 409, description = "Clockify não configurado (API Key, workspace e usuário)", body = ErrorResponse)
    )
)]
pub async fn get_clockify_entries(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<ClockifyEntriesQuery>,
) -> Response {
    forward(
        &state,
        "clockify.entries",
        json!({ "from": q.from, "to": q.to, "onlyDefaultTags": q.only_default_tags }),
    )
    .await
}

#[derive(Deserialize)]
pub struct MondayEntriesQuery {
    period: Option<String>,
}

#[utoipa::path(
    get,
    path = "/integrations/monday/entries",
    tag = "integrations",
    params(
        ("period" = Option<String>, Query, description = "`today`, `7days` (padrão), `30days` ou `month` (do dia 1 até hoje) — \
            as janelas de \"Atividades no Monday\". Não há período livre: a busca no Monday não filtra por data.")
    ),
    responses(
        (status = 200, description = "As atividades do usuário nos boards vinculados que cruzam a janela, por dia de \
            início, como \"Atividades no Monday\" as mostra", body = MondayEntriesDto),
        (status = 400, description = "`period` fora das quatro janelas", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, sem o usuário da conta ou sem projeto com board", body = ErrorResponse)
    )
)]
pub async fn get_monday_entries(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<MondayEntriesQuery>,
) -> Response {
    forward(&state, "monday.entries", json!({ "period": q.period })).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaySummariesQuery {
    from: Option<String>,
    to: Option<String>,
    workspace_id: Option<String>,
}

#[utoipa::path(
    get,
    path = "/day-summaries",
    tag = "day-summaries",
    params(
        ("from" = Option<String>, Query, description = "Primeiro dia local, YYYY-MM-DD. Ausente = hoje."),
        ("to" = Option<String>, Query, description = "Último dia local, YYYY-MM-DD. Ausente = `from`. No máximo 366 dias."),
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Os resumos já gerados do período, lidos do banco local — não chama o provedor", body = DaySummariesDto),
        (status = 400, description = "Data fora do formato, `from` depois de `to` ou período maior que 366 dias", body = ErrorResponse),
        (status = 409, description = "Provedor de IA não configurado, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn get_day_summaries(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<DaySummariesQuery>,
) -> Response {
    forward(
        &state,
        "daySummaries.list",
        json!({ "from": q.from, "to": q.to, "workspaceId": q.workspace_id }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/day-summaries/generate",
    tag = "day-summaries",
    request_body(
        content = GenerateDaySummariesRequest,
        description = "Opcional. Os dias são os da busca do Histórico com estes filtros, como a aba Resumo: \
            os 5 mais recentes com tarefa concluída. Dia já resumido volta do banco sem chamar o provedor; \
            hoje é sempre regerado. O lote é sequencial e para no primeiro limite de cota.",
        example = json!({ "from": "2026-09-14", "to": "2026-09-18" })
    ),
    responses(
        (status = 200, description = "O resultado por dia: resumos (do cache ou gerados), erros já traduzidos \
            e os dias não tentados por limite de cota", body = GenerateDaySummariesResponse),
        (status = 400, description = "Data ou filtro fora do formato", body = ErrorResponse),
        (status = 409, description = "Provedor de IA não configurado; workspace, projeto ou categoria não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_day_summaries_generate(
    State(state): State<Arc<ApiState>>,
    body: Bytes,
) -> Response {
    forward_with_body::<GenerateDaySummariesRequest>(
        &state,
        "daySummaries.generate",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/backup/drive",
    tag = "backup",
    responses(
        (status = 200, description = "O estado do backup no Drive, como a subseção \"Backup do banco\" o mostra", body = DriveBackupStatusDto)
    )
)]
pub async fn get_drive_backup(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "driveBackup.status", json!({})).await
}

#[utoipa::path(
    post,
    path = "/backup/drive/run",
    tag = "backup",
    responses(
        (status = 200, description = "Backup enviado (o \"Fazer backup agora\"); poda os antigos além da quantidade configurada", body = DriveBackupRunResponse),
        (status = 409, description = "Google não conectado", body = ErrorResponse),
        (status = 502, description = "O Drive recusou ou falhou; a mensagem é a que a tela mostra (ex.: reconectar o Google)", body = ErrorResponse)
    )
)]
pub async fn post_drive_backup_run(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "driveBackup.run", json!({})).await
}

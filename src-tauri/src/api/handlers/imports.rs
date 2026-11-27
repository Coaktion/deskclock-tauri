//! Imports das integrações (Google Agenda, Zendesk, Monday): prévia e import
//! onde a tela seleciona, e os botões da "Importação de dados" do Monday. Só
//! repassam à janela principal.

use super::{forward, forward_with_body};
use crate::api::models::{
    CalendarImportPreviewDto, CalendarImportRequest, CalendarImportResponse, ErrorResponse,
    MondayCategoriesImportResponse, MondayFieldCatalogsDto, MondayImportPreviewDto,
    MondayImportRequest, MondayImportResponse, MondayProjectsImportResponse,
    ZendeskImportPreviewDto, ZendeskImportRequest, ZendeskImportResponse,
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
pub struct CalendarPreviewQuery {
    from: Option<String>,
    to: Option<String>,
}

#[utoipa::path(
    get,
    path = "/integrations/google_calendar/import-preview",
    tag = "integrations",
    params(
        ("from" = Option<String>, Query, description = "Primeiro dia local, YYYY-MM-DD. Ausentes os dois = a semana corrente."),
        ("to" = Option<String>, Query, description = "Último dia local, YYYY-MM-DD. Só `from` = o próprio dia.")
    ),
    responses(
        (status = 200, description = "Eventos do período, como a lista do \"Importar eventos\": a sugestão de cada um \
            e os sinais \"já existe\", \"ignorado\" e \"marcado\"", body = CalendarImportPreviewDto),
        (status = 400, description = "Data fora do formato, ou `from` depois de `to`", body = ErrorResponse),
        (status = 409, description = "Google não conectado", body = ErrorResponse)
    )
)]
pub async fn get_calendar_import_preview(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<CalendarPreviewQuery>,
) -> Response {
    forward(
        &state,
        "calendar.importPreview",
        json!({ "from": q.from, "to": q.to }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/integrations/google_calendar/import",
    tag = "integrations",
    request_body(
        content = CalendarImportRequest,
        description = "Importa os eventos indicados como planejadas no workspace da integração, como o botão \
            Importar. Campo ausente na linha = a sugestão da prévia. Recorrentes de mesmo nome e horário viram uma \
            planejada só, com os dias unidos. Não confere duplicata: reimportar cria outra planejada.",
        example = json!({ "events": [{ "id": "abc123" }, { "id": "def456", "projectName": "Cliente" }] })
    ),
    responses(
        (status = 200, description = "Planejadas criadas, eventos absorvidos e reuniões rastreadas", body = CalendarImportResponse),
        (status = 400, description = "Lista vazia ou fora do formato, agendamento ou dia inválido", body = ErrorResponse),
        (status = 404, description = "Evento fora do período (ou no fim de semana, com ele desligado)", body = ErrorResponse),
        (status = 409, description = "Google não conectado; projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn post_calendar_import(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CalendarImportRequest>(&state, "calendar.import", &body, true, json!({}))
        .await
}

#[utoipa::path(
    get,
    path = "/integrations/zendesk/import-preview",
    tag = "integrations",
    responses(
        (status = 200, description = "Tickets atribuídos a você em aberto, com a linha como a tela a abre", body = ZendeskImportPreviewDto),
        (status = 409, description = "Zendesk não conectado", body = ErrorResponse)
    )
)]
pub async fn get_zendesk_import_preview(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "zendesk.importPreview", json!({})).await
}

#[utoipa::path(
    post,
    path = "/integrations/zendesk/import",
    tag = "integrations",
    request_body(
        content = ZendeskImportRequest,
        description = "Importa os tickets indicados como planejadas no workspace da integração. Campo ausente = o \
            padrão da tela. Não confere duplicata: reimportar cria outra planejada.",
        example = json!({ "tickets": [{ "id": 4512 }] })
    ),
    responses(
        (status = 200, description = "Quantas planejadas foram criadas", body = ZendeskImportResponse),
        (status = 400, description = "Lista vazia ou fora do formato, agendamento ou data inválida", body = ErrorResponse),
        (status = 404, description = "Ticket fora dos atribuídos a você em aberto", body = ErrorResponse),
        (status = 409, description = "Zendesk não conectado; projeto ou categoria não encontrado no workspace", body = ErrorResponse)
    )
)]
pub async fn post_zendesk_import(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ZendeskImportRequest>(&state, "zendesk.import", &body, true, json!({}))
        .await
}

#[derive(Deserialize)]
pub struct MondayPreviewQuery {
    period: Option<String>,
}

#[utoipa::path(
    get,
    path = "/integrations/monday/import-preview",
    tag = "integrations",
    params(
        ("period" = Option<String>, Query, description = "`today`, `week` (padrão) ou `next30`, como os filtros do modal. \
            Item sem cronograma entra em todos.")
    ),
    responses(
        (status = 200, description = "Seus itens fora do grupo Activities nos boards vinculados, com a sugestão de \
            categoria e etapa, e o que já tem planejada", body = MondayImportPreviewDto),
        (status = 400, description = "`period` fora das opções", body = ErrorResponse),
        (status = 409, description = "Monday não configurado, nenhum board vinculado, boards de outro workspace \
            ou falta o usuário da conta", body = ErrorResponse)
    )
)]
pub async fn get_monday_import_preview(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<MondayPreviewQuery>,
) -> Response {
    forward(
        &state,
        "monday.importPreview",
        json!({ "period": q.period }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/integrations/monday/import",
    tag = "integrations",
    request_body(
        content = MondayImportRequest,
        description = "Importa os itens indicados como planejadas no workspace da integração e grava o vínculo que \
            o import automático usa. O agendamento vem da Timeline do item.",
        example = json!({ "items": [{ "id": "1234567890" }] })
    ),
    responses(
        (status = 200, description = "Planejadas criadas", body = MondayImportResponse),
        (status = 400, description = "Lista vazia ou fora do formato, ou etapa fora das opções", body = ErrorResponse),
        (status = 404, description = "Item fora dos seus nos boards vinculados", body = ErrorResponse),
        (status = 409, description = "Monday não configurado; item que já tem planejada; categoria não encontrada; \
            etapa sem campo configurado", body = ErrorResponse)
    )
)]
pub async fn post_monday_import(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<MondayImportRequest>(&state, "monday.import", &body, true, json!({})).await
}

#[utoipa::path(
    post,
    path = "/integrations/monday/import-projects",
    tag = "integrations",
    responses(
        (status = 200, description = "O \"Importar\"/\"Atualizar\" de Projetos: relê o Portfólio e o schema dos boards, \
            cria os projetos e semeia as categorias de cada um", body = MondayProjectsImportResponse),
        (status = 409, description = "Monday não configurado ou sem board de Portfólio", body = ErrorResponse)
    )
)]
pub async fn post_monday_import_projects(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "monday.importProjects", json!({})).await
}

#[utoipa::path(
    post,
    path = "/integrations/monday/import-categories",
    tag = "integrations",
    responses(
        (status = 200, description = "Uma categoria por Activity Type; as que existem não mudam", body = MondayCategoriesImportResponse),
        (status = 409, description = "Monday não configurado, ou sem Activity Type (leia os catálogos ou importe os projetos)", body = ErrorResponse)
    )
)]
pub async fn post_monday_import_categories(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "monday.importCategories", json!({})).await
}

#[utoipa::path(
    post,
    path = "/integrations/monday/read-catalogs",
    tag = "integrations",
    responses(
        (status = 200, description = "Os rótulos do board de Report de Horas, guardados para semear categorias e campos", body = MondayFieldCatalogsDto),
        (status = 409, description = "Monday não configurado ou sem board de Report", body = ErrorResponse)
    )
)]
pub async fn post_monday_read_catalogs(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "monday.readCatalogs", json!({})).await
}

//! Fase D3b da paridade: os ajustes **não secretos** de cada integração — leitura
//! e edição parcial por integração — e as ações da tela de Integrações que não
//! são um campo (regras de ignorar da Agenda, listas, vínculos e imports do
//! Clockify, campos de catálogo e quadro do Monday, "Enviar agora"). Só repassam
//! à janela principal; validação e gravação são as da tela, no TS. Conectar
//! (chave, OAuth, token) não passa por aqui, e nenhuma resposta traz segredo.

use super::{forward, forward_with_body};
use crate::api::models::{
    CalendarIgnoreRuleDto, CalendarIgnoreRulesResponse, CalendarSettingsDto, CalendarSettingsPatch,
    ClockifyCatalogResponse, ClockifyImportResponse, ClockifyProjectMappingRequest,
    ClockifySettingsDto, ClockifySettingsPatch, ClockifyTagIdsRequest, ClockifyWorkspacesResponse,
    DriveBackupSettingsDto, DriveBackupSettingsPatch, ErrorResponse, LlmSettingsDto,
    MondayCatalogFieldCreateResponse, MondayCatalogFieldRefreshResponse, MondayProjectBoardRequest,
    MondayProjectRefDto, MondaySettingsDto, MondaySettingsPatch, SheetsSettingsDto,
    SheetsSettingsPatch, SyncNowResponse, ZendeskSettingsDto, ZendeskSettingsPatch,
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

// ---------------- Google Sheets ----------------

#[utoipa::path(
    get,
    path = "/settings/integrations/google_sheets",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Google → Google Sheets", body = SheetsSettingsDto))
)]
pub async fn get_sheets(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getSheets", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/integrations/google_sheets",
    tag = "integration-settings",
    request_body(
        content = SheetsSettingsPatch,
        description = "Ausente mantém. Como os campos da tela: o id da planilha é aparado e a aba em branco vira \
            `DeskClock`. `columnMapping` é a lista inteira das oito colunas (reordenar, ligar, renomear).",
        example = json!({ "sheetName": "Horas", "autoSyncEnabled": true, "autoSyncMode": "daily" })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = SheetsSettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou valor fora das opções da tela", body = ErrorResponse),
        (status = 409, description = "Google não conectado, ou workspace que não existe", body = ErrorResponse)
    )
)]
pub async fn patch_sheets(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<SheetsSettingsPatch>(
        &state,
        "settings.updateSheets",
        &body,
        false,
        json!({}),
    )
    .await
}

// ---------------- Google Agenda ----------------

#[utoipa::path(
    get,
    path = "/settings/integrations/google_calendar",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Google → Google Calendar", body = CalendarSettingsDto))
)]
pub async fn get_calendar(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getCalendar", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/integrations/google_calendar",
    tag = "integration-settings",
    request_body(
        content = CalendarSettingsPatch,
        description = "Ausente mantém. `workspaceId` governa só o \"Importar eventos\": o rastreio automático de \
            reuniões cria no workspace ativo. As regras de ignorar têm rota própria, um item por vez.",
        example = json!({ "autoTrackingEnabled": true })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = CalendarSettingsDto),
        (status = 400, description = "Chave desconhecida ou `null`", body = ErrorResponse),
        (status = 409, description = "Google não conectado, ou workspace que não existe", body = ErrorResponse)
    )
)]
pub async fn patch_calendar(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CalendarSettingsPatch>(
        &state,
        "settings.updateCalendar",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/integrations/google_calendar/ignore-rules",
    tag = "integration-settings",
    request_body(
        content = CalendarIgnoreRuleDto,
        description = "O \"Adicionar\" de \"Eventos ignorados\". O \"Ignorar sempre\" do import é esta mesma regra \
            com `equals` e o título do evento. Repetida (mesmo operador, mesmo nome normalizado) não entra.",
        example = json!({ "operator": "equals", "value": "Daily" })
    ),
    responses(
        (status = 201, description = "Regra criada", body = CalendarIgnoreRulesResponse),
        (status = 200, description = "A regra já existia (`added: false`)", body = CalendarIgnoreRulesResponse),
        (status = 400, description = "Operador fora de `equals`/`contains`, ou nome em branco", body = ErrorResponse),
        (status = 409, description = "Google não conectado", body = ErrorResponse)
    )
)]
pub async fn post_ignore_rule(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CalendarIgnoreRuleDto>(
        &state,
        "calendar.addIgnoreRule",
        &body,
        true,
        json!({}),
    )
    .await
}

#[derive(Deserialize)]
pub struct IgnoreRuleQuery {
    operator: String,
    value: String,
}

#[utoipa::path(
    delete,
    path = "/integrations/google_calendar/ignore-rules",
    tag = "integration-settings",
    params(
        ("operator" = String, Query, description = "`equals` ou `contains`."),
        ("value" = String, Query, description = "O nome da regra; caixa e espaço nas pontas não contam.")
    ),
    responses(
        (status = 200, description = "Regra removida", body = CalendarIgnoreRulesResponse),
        (status = 404, description = "Nenhuma regra com esse operador e nome", body = ErrorResponse),
        (status = 409, description = "Google não conectado", body = ErrorResponse)
    )
)]
pub async fn delete_ignore_rule(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<IgnoreRuleQuery>,
) -> Response {
    forward(
        &state,
        "calendar.removeIgnoreRule",
        json!({ "body": { "operator": q.operator, "value": q.value } }),
    )
    .await
}

// ---------------- Backup no Drive ----------------

#[utoipa::path(
    get,
    path = "/settings/integrations/google_drive",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Google → Backup do banco: o automático e a frequência. \
        O último backup e a falha estão em `GET /backup/drive`", body = DriveBackupSettingsDto))
)]
pub async fn get_drive_backup(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getDriveBackup", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/integrations/google_drive",
    tag = "integration-settings",
    request_body(
        content = DriveBackupSettingsPatch,
        description = "Ausente mantém. O agendador lê na hora: ligado e vencido, o backup roda no próximo ciclo.",
        example = json!({ "enabled": true, "frequency": "weekly" })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = DriveBackupSettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou frequência fora de daily/weekly/monthly", body = ErrorResponse),
        (status = 409, description = "Google não conectado", body = ErrorResponse)
    )
)]
pub async fn patch_drive_backup(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<DriveBackupSettingsPatch>(
        &state,
        "settings.updateDriveBackup",
        &body,
        false,
        json!({}),
    )
    .await
}

// ---------------- Clockify ----------------

#[utoipa::path(
    get,
    path = "/settings/integrations/clockify",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Clockify: workspaces, vínculos, tags padrão e envio automático", body = ClockifySettingsDto))
)]
pub async fn get_clockify(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getClockify", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/integrations/clockify",
    tag = "integration-settings",
    request_body(
        content = ClockifySettingsPatch,
        description = "Ausente mantém. `clockifyWorkspaceId` é um de `GET /integrations/clockify/workspaces`; trocar \
            muda o recorte dos vínculos, sem apagar os do outro workspace.",
        example = json!({ "clockifyWorkspaceId": "5f1…", "autoSyncEnabled": true })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = ClockifySettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou valor fora das opções", body = ErrorResponse),
        (status = 409, description = "Clockify não conectado, workspace que não existe, ou workspace do Clockify fora da lista", body = ErrorResponse)
    )
)]
pub async fn patch_clockify(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ClockifySettingsPatch>(
        &state,
        "settings.updateClockify",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/integrations/clockify/workspaces",
    tag = "integration-settings",
    responses(
        (status = 200, description = "\"Atualizar lista\" do Workspace Clockify: relê do Clockify e guarda a lista que o seletor oferece", body = ClockifyWorkspacesResponse),
        (status = 409, description = "Clockify não conectado", body = ErrorResponse)
    )
)]
pub async fn get_clockify_workspaces(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "clockify.workspaces", json!({})).await
}

#[utoipa::path(
    get,
    path = "/integrations/clockify/catalog",
    tag = "integration-settings",
    responses(
        (status = 200, description = "Projetos e tags do workspace do Clockify, de onde vêm os ids dos vínculos", body = ClockifyCatalogResponse),
        (status = 409, description = "Clockify não configurado", body = ErrorResponse)
    )
)]
pub async fn get_clockify_catalog(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "clockify.catalog", json!({})).await
}

#[utoipa::path(
    put,
    path = "/integrations/clockify/project-mappings/{id}",
    tag = "integration-settings",
    params(("id" = String, Path, description = "Id do projeto do DeskClock")),
    request_body(content = ClockifyProjectMappingRequest, description = "O projeto do Clockify da linha, como o autocomplete"),
    responses(
        (status = 200, description = "Os ajustes do Clockify com o vínculo", body = ClockifySettingsDto),
        (status = 404, description = "Projeto do DeskClock não encontrado", body = ErrorResponse),
        (status = 409, description = "Clockify não configurado, ou projeto do Clockify que não existe", body = ErrorResponse)
    )
)]
pub async fn put_clockify_project_mapping(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<ClockifyProjectMappingRequest>(
        &state,
        "clockify.setProjectMapping",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/integrations/clockify/project-mappings/{id}",
    tag = "integration-settings",
    params(("id" = String, Path, description = "Id do projeto do DeskClock")),
    responses(
        (status = 204, description = "Vínculo desfeito, como o X da linha"),
        (status = 404, description = "Projeto sem vínculo no workspace do Clockify", body = ErrorResponse),
        (status = 409, description = "Clockify não configurado", body = ErrorResponse)
    )
)]
pub async fn delete_clockify_project_mapping(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "clockify.removeProjectMapping", json!({ "id": id })).await
}

#[utoipa::path(
    put,
    path = "/integrations/clockify/category-mappings/{id}",
    tag = "integration-settings",
    params(("id" = String, Path, description = "Id da categoria do DeskClock")),
    request_body(content = ClockifyTagIdsRequest, description = "As tags da categoria (a seleção inteira, como a multisseleção)"),
    responses(
        (status = 200, description = "Os ajustes do Clockify com o vínculo", body = ClockifySettingsDto),
        (status = 404, description = "Categoria não encontrada", body = ErrorResponse),
        (status = 409, description = "Clockify não configurado, ou tag que não existe", body = ErrorResponse)
    )
)]
pub async fn put_clockify_category_mapping(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<ClockifyTagIdsRequest>(
        &state,
        "clockify.setCategoryTags",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

#[utoipa::path(
    put,
    path = "/integrations/clockify/default-tags",
    tag = "integration-settings",
    request_body(content = ClockifyTagIdsRequest, description = "\"Tags padrão\", adicionadas em todo envio"),
    responses(
        (status = 200, description = "Os ajustes do Clockify", body = ClockifySettingsDto),
        (status = 409, description = "Clockify não configurado, ou tag que não existe", body = ErrorResponse)
    )
)]
pub async fn put_clockify_default_tags(
    State(state): State<Arc<ApiState>>,
    body: Bytes,
) -> Response {
    forward_with_body::<ClockifyTagIdsRequest>(
        &state,
        "clockify.setDefaultTags",
        &body,
        true,
        json!({}),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/integrations/clockify/import-projects",
    tag = "integration-settings",
    responses(
        (status = 200, description = "\"Importar do Clockify\" dos projetos: um projeto por projeto do Clockify, já \
            vinculado; os vínculos do workspace do Clockify são substituídos pelos do import", body = ClockifyImportResponse),
        (status = 409, description = "Clockify não configurado", body = ErrorResponse)
    )
)]
pub async fn post_clockify_import_projects(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "clockify.importProjects", json!({})).await
}

#[utoipa::path(
    post,
    path = "/integrations/clockify/import-tags",
    tag = "integration-settings",
    responses(
        (status = 200, description = "\"Importar do Clockify\" das tags: uma categoria (billable) por tag, vinculada", body = ClockifyImportResponse),
        (status = 409, description = "Clockify não configurado", body = ErrorResponse)
    )
)]
pub async fn post_clockify_import_tags(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "clockify.importTags", json!({})).await
}

// ---------------- Monday ----------------

#[utoipa::path(
    get,
    path = "/settings/integrations/monday",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Monday: boards, campos de catálogo, projetos vinculados, \
        importação automática e envio automático", body = MondaySettingsDto))
)]
pub async fn get_monday(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getMonday", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/integrations/monday",
    tag = "integration-settings",
    request_body(
        content = MondaySettingsPatch,
        description = "Ausente mantém. Ids de board aparados. Os campos de catálogo aceitam só campo personalizado de \
            seleção não arquivado (ou o já vinculado); `\"\"` desvincula.",
        example = json!({ "autoImportEnabled": true, "projectStageFieldId": "f-1" })
    ),
    responses(
        (status = 200, description = "O grupo como ficou", body = MondaySettingsDto),
        (status = 400, description = "Chave desconhecida, `null`, ou valor fora das opções", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, workspace que não existe, ou campo que não pode ser vinculado", body = ErrorResponse)
    )
)]
pub async fn patch_monday(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<MondaySettingsPatch>(
        &state,
        "settings.updateMonday",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/integrations/monday/catalog-fields/{id}",
    tag = "integration-settings",
    params(("id" = String, Path, description = "`project_stage` ou `non_billable_reason`")),
    responses(
        (status = 201, description = "\"Criar do Monday\": campo de seleção criado com os rótulos do board e vinculado", body = MondayCatalogFieldCreateResponse),
        (status = 200, description = "Um campo de seleção homônimo já existia e foi vinculado", body = MondayCatalogFieldCreateResponse),
        (status = 400, description = "Homônimo que não é de seleção", body = ErrorResponse),
        (status = 404, description = "Campo de catálogo desconhecido", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, campo já vinculado, ou catálogos não lidos", body = ErrorResponse)
    )
)]
pub async fn post_monday_catalog_field(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "monday.createCatalogField", json!({ "id": id })).await
}

#[utoipa::path(
    post,
    path = "/integrations/monday/catalog-fields/{id}/refresh",
    tag = "integration-settings",
    params(("id" = String, Path, description = "`project_stage` ou `non_billable_reason`")),
    responses(
        (status = 200, description = "\"Atualizar\": os rótulos do board que faltavam viram opção; as existentes ficam", body = MondayCatalogFieldRefreshResponse),
        (status = 404, description = "Campo de catálogo desconhecido", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, nenhum campo vinculado, ou catálogos não lidos", body = ErrorResponse)
    )
)]
pub async fn post_monday_catalog_field_refresh(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Response {
    forward(&state, "monday.refreshCatalogField", json!({ "id": id })).await
}

#[utoipa::path(
    put,
    path = "/integrations/monday/projects/{id}/board",
    tag = "integration-settings",
    params(("id" = String, Path, description = "Id do item do Portfólio (`portfolioItemId` de `GET /settings/integrations/monday`)")),
    request_body(content = MondayProjectBoardRequest, description = "O \"ID do quadro\" digitado à mão; o schema do board é lido antes de gravar"),
    responses(
        (status = 200, description = "O projeto com o quadro", body = MondayProjectRefDto),
        (status = 400, description = "`boardId` vazio", body = ErrorResponse),
        (status = 404, description = "Item do Portfólio sem projeto vinculado", body = ErrorResponse),
        (status = 409, description = "Monday não conectado, projeto que já tem quadro, ou board que não serve de destino", body = ErrorResponse)
    )
)]
pub async fn put_monday_project_board(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    forward_with_body::<MondayProjectBoardRequest>(
        &state,
        "monday.setProjectBoard",
        &body,
        true,
        json!({ "id": id }),
    )
    .await
}

// ---------------- Zendesk e IA ----------------

#[utoipa::path(
    get,
    path = "/settings/integrations/zendesk",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Zendesk: o workspace dos tickets importados", body = ZendeskSettingsDto))
)]
pub async fn get_zendesk(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getZendesk", json!({})).await
}

#[utoipa::path(
    patch,
    path = "/settings/integrations/zendesk",
    tag = "integration-settings",
    request_body(content = ZendeskSettingsPatch, example = json!({ "workspaceId": "ws-1" })),
    responses(
        (status = 200, description = "O grupo como ficou", body = ZendeskSettingsDto),
        (status = 400, description = "Chave desconhecida (subdomínio e client são da conexão) ou `null`", body = ErrorResponse),
        (status = 409, description = "Zendesk não conectado, ou workspace que não existe", body = ErrorResponse)
    )
)]
pub async fn patch_zendesk(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ZendeskSettingsPatch>(
        &state,
        "settings.updateZendesk",
        &body,
        false,
        json!({}),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/settings/integrations/llm",
    tag = "integration-settings",
    responses((status = 200, description = "Integrações → Provedor de IA, só leitura: provedor e modelo se trocam \
        pelo modal de conexão, que testa a chave", body = LlmSettingsDto))
)]
pub async fn get_llm(State(state): State<Arc<ApiState>>) -> Response {
    forward(&state, "settings.getLlm", json!({})).await
}

// ---------------- "Enviar agora" ----------------

#[utoipa::path(
    post,
    path = "/integrations/{id}/sync-now",
    tag = "integration-settings",
    params(("id" = String, Path, description = "`google_sheets` ou `monday` (o card do Clockify não tem o botão)")),
    responses(
        (status = 200, description = "O \"Enviar agora\" do envio automático diário: envia na hora o que falta, desde o \
            último envio", body = SyncNowResponse),
        (status = 404, description = "Integração sem \"Enviar agora\"", body = ErrorResponse),
        (status = 409, description = "Integração não conectada, envio diário desligado, ou planilha sem id", body = ErrorResponse),
        (status = 502, description = "O envio falhou no serviço; a mensagem é a do toast", body = ErrorResponse)
    )
)]
pub async fn post_sync_now(State(state): State<Arc<ApiState>>, Path(id): Path<String>) -> Response {
    forward(&state, "integrations.syncNow", json!({ "id": id })).await
}

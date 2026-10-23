//! Exportação de tarefas: CRUD de perfis e o conteúdo gerado com um perfil. Só
//! repassam à janela principal — e nada é gravado em disco: salvar e copiar
//! ficam com quem chama.

use super::{forward, forward_with_body, scoped_params, WorkspaceQuery};
use crate::api::models::{
    CreateExportProfileRequest, ErrorResponse, ExportProfileDto, GenerateExportRequest,
    TaskExportDto, UpdateExportProfileRequest,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    response::Response,
};
use serde_json::json;
use std::sync::Arc;

#[utoipa::path(
    get,
    path = "/export-profiles",
    tag = "export",
    params(
        ("workspaceId" = Option<String>, Query, description = "Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Perfis do workspace, o padrão primeiro e depois por nome", body = Vec<ExportProfileDto>),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn get_export_profiles(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(
        &state,
        "exportProfiles.list",
        json!({ "workspaceId": q.workspace_id }),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/export-profiles",
    tag = "export",
    request_body(
        content = CreateExportProfileRequest,
        description = "Ausente vale o que o formulário de perfil novo traz: `csv`, `comma`, `hh:mm:ss`, `iso`, \
            não padrão e as sete colunas de sistema visíveis. Os campos personalizados ativos que faltarem em \
            `columns` entram invisíveis. `isDefault: true` tira o padrão do perfil anterior do workspace.",
        example = json!({ "name": "Planilha do cliente", "format": "csv", "separator": "semicolon", "durationFormat": "decimal" })
    ),
    responses(
        (status = 201, description = "Perfil criado", body = ExportProfileDto),
        (status = 400, description = "Nome vazio, valor fora das opções ou coluna desconhecida/repetida", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_export_profile(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CreateExportProfileRequest>(
        &state,
        "exportProfiles.create",
        &body,
        true,
        json!({}),
    )
    .await
}

#[utoipa::path(
    put,
    path = "/export-profiles/{id}",
    tag = "export",
    params(
        ("id" = String, Path, description = "ID do perfil"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do perfil. Ausente = workspace ativo.")
    ),
    request_body(
        content = UpdateExportProfileRequest,
        description = "Campos ausentes são preservados. `columns` é a lista final; os campos personalizados ativos \
            que faltarem entram invisíveis. `isDefault: false` no padrão deixa o workspace sem padrão, como na tela.",
        example = json!({ "dateFormat": "dd/mm/yyyy" })
    ),
    responses(
        (status = 200, description = "Perfil atualizado", body = ExportProfileDto),
        (status = 400, description = "Nome vazio, valor fora das opções ou coluna desconhecida/repetida", body = ErrorResponse),
        (status = 404, description = "Perfil não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_export_profile(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
    body: Bytes,
) -> Response {
    forward_with_body::<UpdateExportProfileRequest>(
        &state,
        "exportProfiles.update",
        &body,
        true,
        scoped_params(id, &q),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/export-profiles/{id}",
    tag = "export",
    params(
        ("id" = String, Path, description = "ID do perfil"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do perfil. Ausente = workspace ativo.")
    ),
    responses(
        (status = 204, description = "Perfil excluído, sem confirmação"),
        (status = 404, description = "Perfil não existe no workspace", body = ErrorResponse),
        (status = 409, description = "É o único perfil do workspace, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn delete_export_profile(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(&state, "exportProfiles.delete", scoped_params(id, &q)).await
}

#[utoipa::path(
    put,
    path = "/export-profiles/{id}/default",
    tag = "export",
    params(
        ("id" = String, Path, description = "ID do perfil"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do perfil. Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Perfil marcado como padrão; o anterior do workspace deixa de ser", body = ExportProfileDto),
        (status = 404, description = "Perfil não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_export_profile_default(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(&state, "exportProfiles.setDefault", scoped_params(id, &q)).await
}

#[utoipa::path(
    post,
    path = "/export",
    tag = "export",
    request_body(
        content = GenerateExportRequest,
        description = "Opcional — sem corpo, exporta as tarefas concluídas de hoje no workspace ativo com o perfil \
            padrão. Como o modal Exportar: tarefas agrupadas (nome + projeto + categoria + valores personalizados) \
            viram um registro com a duração somada. **Não grava arquivo**: o conteúdo vem na resposta.",
        example = json!({ "from": "2026-10-01", "to": "2026-10-31" })
    ),
    responses(
        (status = 200, description = "Conteúdo gerado; `rowCount` 0 dá CSV vazio ou `[]`", body = TaskExportDto),
        (status = 400, description = "Data fora do formato, `from` depois de `to`, ou `taskIds` vazio", body = ErrorResponse),
        (status = 404, description = "`profileId` não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Workspace sem perfil, workspace não encontrado, ou tarefa de `taskIds` fora das \
            concluídas do período no workspace", body = ErrorResponse)
    )
)]
pub async fn post_export(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<GenerateExportRequest>(&state, "export.generate", &body, false, json!({}))
        .await
}

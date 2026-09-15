//! Projetos, categorias e categorias por projeto. Como o resto dos handlers,
//! só repassam à janela principal.

use super::{forward, forward_with_body, scoped_params, WorkspaceQuery};
use crate::api::models::{
    CategoryDto, CreateCategoryRequest, CreateProjectRequest, DeleteManyRequest, ErrorResponse,
    ImportCatalogRequest, ImportCatalogResponse, ProjectCategoryDto, ProjectDto,
    SetProjectCategoriesRequest, UpdateCategoryRequest, UpdateProjectRequest,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    response::Response,
};
use serde_json::json;
use std::sync::Arc;

// ================================================================
// Projetos
// ================================================================

#[utoipa::path(
    post,
    path = "/projects",
    tag = "catalog",
    request_body(
        content = CreateProjectRequest,
        description = "Novo projeto. A cor é atribuída pelo app (primeiro slot livre do workspace).",
        example = json!({ "name": "Cliente ACME" })
    ),
    responses(
        (status = 201, description = "Projeto criado", body = ProjectDto,
            example = json!({ "id": "8f1c…", "workspaceId": "00000000-0000-4000-8000-000000000001", "name": "Cliente ACME", "colorIndex": 2 })),
        (status = 400, description = "Nome vazio", body = ErrorResponse),
        (status = 409, description = "Nome já existe no workspace, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_project(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CreateProjectRequest>(&state, "projects.create", &body, true, json!({}))
        .await
}

#[utoipa::path(
    put,
    path = "/projects/{id}",
    tag = "catalog",
    params(
        ("id" = String, Path, description = "ID do projeto"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do projeto. Ausente = workspace ativo.")
    ),
    request_body(
        content = UpdateProjectRequest,
        description = "Renomeia o projeto.",
        example = json!({ "name": "Cliente ACME (novo contrato)" })
    ),
    responses(
        (status = 200, description = "Projeto atualizado", body = ProjectDto),
        (status = 404, description = "Projeto não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Nome já existe no workspace, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_project(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
    body: Bytes,
) -> Response {
    forward_with_body::<UpdateProjectRequest>(
        &state,
        "projects.update",
        &body,
        true,
        scoped_params(id, &q),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/projects/{id}",
    tag = "catalog",
    params(
        ("id" = String, Path, description = "ID do projeto"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do projeto. Ausente = workspace ativo.")
    ),
    responses(
        (status = 204, description = "Projeto excluído, sem confirmação"),
        (status = 404, description = "Projeto não existe no workspace", body = ErrorResponse)
    )
)]
pub async fn delete_project(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(&state, "projects.delete", scoped_params(id, &q)).await
}

#[utoipa::path(
    post,
    path = "/projects/import",
    tag = "catalog",
    request_body(
        content = ImportCatalogRequest,
        description = "Um projeto por linha. Linhas vazias são ignoradas; nomes repetidos voltam em `skipped`.",
        example = json!({ "text": "Cliente ACME\nProjeto interno" })
    ),
    responses(
        (status = 200, description = "Resultado da importação", body = ImportCatalogResponse,
            example = json!({ "created": 1, "skipped": ["Projeto interno"] })),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_projects_import(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ImportCatalogRequest>(&state, "projects.import", &body, true, json!({}))
        .await
}

#[utoipa::path(
    post,
    path = "/projects/delete",
    tag = "catalog",
    request_body(
        content = DeleteManyRequest,
        description = "Exclui vários projetos de uma vez. Se algum id não existir no workspace, nada é excluído.",
        example = json!({ "ids": ["8f1c…", "a2b4…"] })
    ),
    responses(
        (status = 204, description = "Projetos excluídos"),
        (status = 404, description = "Algum id não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_projects_delete(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<DeleteManyRequest>(&state, "projects.deleteMany", &body, true, json!({}))
        .await
}

// ================================================================
// Categorias por projeto
// ================================================================

#[utoipa::path(
    get,
    path = "/projects/{id}/categories",
    tag = "catalog",
    params(
        ("id" = String, Path, description = "ID do projeto"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do projeto. Ausente = workspace ativo.")
    ),
    responses(
        (status = 200, description = "Categorias associadas. Lista vazia = o projeto oferece todas as categorias do workspace.",
            body = Vec<ProjectCategoryDto>,
            example = json!([{ "categoryId": "c1d2…", "source": "manual", "createdAt": "2026-09-15T13:00:00.000Z" }])),
        (status = 404, description = "Projeto não existe no workspace", body = ErrorResponse)
    )
)]
pub async fn get_project_categories(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(&state, "projectCategories.list", scoped_params(id, &q)).await
}

#[utoipa::path(
    put,
    path = "/projects/{id}/categories",
    tag = "catalog",
    params(
        ("id" = String, Path, description = "ID do projeto"),
        ("workspaceId" = Option<String>, Query, description = "Workspace do projeto. Ausente = workspace ativo.")
    ),
    request_body(
        content = SetProjectCategoriesRequest,
        description = "Substitui a seleção: o que não está na lista sai, inclusive associações vindas do Monday. \
            Lista vazia remove o filtro.",
        example = json!({ "categoryIds": ["c1d2…", "e3f4…"] })
    ),
    responses(
        (status = 200, description = "Associações gravadas", body = Vec<ProjectCategoryDto>),
        (status = 404, description = "Projeto não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Categoria de outro workspace, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_project_categories(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
    body: Bytes,
) -> Response {
    forward_with_body::<SetProjectCategoriesRequest>(
        &state,
        "projectCategories.set",
        &body,
        true,
        scoped_params(id, &q),
    )
    .await
}

// ================================================================
// Categorias
// ================================================================

#[utoipa::path(
    post,
    path = "/categories",
    tag = "catalog",
    request_body(
        content = CreateCategoryRequest,
        description = "Nova categoria. `defaultBillable` padrão: true.",
        example = json!({ "name": "Reuniões", "defaultBillable": false })
    ),
    responses(
        (status = 201, description = "Categoria criada", body = CategoryDto,
            example = json!({ "id": "c1d2…", "workspaceId": "00000000-0000-4000-8000-000000000001", "name": "Reuniões", "defaultBillable": false })),
        (status = 400, description = "Nome vazio", body = ErrorResponse),
        (status = 409, description = "Nome já existe no workspace, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_category(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<CreateCategoryRequest>(&state, "categories.create", &body, true, json!({}))
        .await
}

#[utoipa::path(
    put,
    path = "/categories/{id}",
    tag = "catalog",
    params(
        ("id" = String, Path, description = "ID da categoria"),
        ("workspaceId" = Option<String>, Query, description = "Workspace da categoria. Ausente = workspace ativo.")
    ),
    request_body(
        content = UpdateCategoryRequest,
        description = "Renomeia a categoria. `defaultBillable` ausente é preservado.",
        example = json!({ "name": "Reuniões internas", "defaultBillable": false })
    ),
    responses(
        (status = 200, description = "Categoria atualizada", body = CategoryDto),
        (status = 404, description = "Categoria não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Nome já existe no workspace, ou workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_category(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
    body: Bytes,
) -> Response {
    forward_with_body::<UpdateCategoryRequest>(
        &state,
        "categories.update",
        &body,
        true,
        scoped_params(id, &q),
    )
    .await
}

#[utoipa::path(
    delete,
    path = "/categories/{id}",
    tag = "catalog",
    params(
        ("id" = String, Path, description = "ID da categoria"),
        ("workspaceId" = Option<String>, Query, description = "Workspace da categoria. Ausente = workspace ativo.")
    ),
    responses(
        (status = 204, description = "Categoria excluída, sem confirmação"),
        (status = 404, description = "Categoria não existe no workspace", body = ErrorResponse)
    )
)]
pub async fn delete_category(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Response {
    forward(&state, "categories.delete", scoped_params(id, &q)).await
}

#[utoipa::path(
    post,
    path = "/categories/import",
    tag = "catalog",
    request_body(
        content = ImportCatalogRequest,
        description = "Uma categoria por linha. Linha começando com `!` cria a categoria não billable.",
        example = json!({ "text": "Desenvolvimento\n!Reuniões internas" })
    ),
    responses(
        (status = 200, description = "Resultado da importação", body = ImportCatalogResponse,
            example = json!({ "created": 2, "skipped": [] })),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_categories_import(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<ImportCatalogRequest>(&state, "categories.import", &body, true, json!({}))
        .await
}

#[utoipa::path(
    post,
    path = "/categories/delete",
    tag = "catalog",
    request_body(
        content = DeleteManyRequest,
        description = "Exclui várias categorias de uma vez. Se algum id não existir no workspace, nada é excluído.",
        example = json!({ "ids": ["c1d2…", "e3f4…"] })
    ),
    responses(
        (status = 204, description = "Categorias excluídas"),
        (status = 404, description = "Algum id não existe no workspace", body = ErrorResponse),
        (status = 409, description = "Workspace não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_categories_delete(State(state): State<Arc<ApiState>>, body: Bytes) -> Response {
    forward_with_body::<DeleteManyRequest>(&state, "categories.deleteMany", &body, true, json!({}))
        .await
}

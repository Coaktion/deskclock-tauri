use utoipa::OpenApi;

use crate::api::handlers;
use crate::api::models;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "DeskClock Local API",
        description = "API REST local do DeskClock para controlar timers, \
listar projetos/categorias e integrar com ferramentas externas \
(Alfred, Raycast, scripts, automações).\n\n\
**Base URL:** `http://localhost:{porta}` (padrão: 27420)\n\n\
Somente `127.0.0.1` — acessível apenas a processos locais.",
        version = "1.0.0"
    ),
    paths(
        handlers::get_status,
        handlers::post_start,
        handlers::post_pause,
        handlers::post_resume,
        handlers::post_stop,
        handlers::post_toggle,
        handlers::post_cancel,
        handlers::workspaces::get_workspaces,
        handlers::workspaces::post_workspace,
        handlers::workspaces::put_workspace,
        handlers::workspaces::delete_workspace,
        handlers::workspaces::get_active_workspace,
        handlers::workspaces::put_active_workspace,
        handlers::get_projects,
        handlers::catalog::post_project,
        handlers::catalog::put_project,
        handlers::catalog::delete_project,
        handlers::catalog::post_projects_import,
        handlers::catalog::post_projects_delete,
        handlers::catalog::get_project_categories,
        handlers::catalog::put_project_categories,
        handlers::get_categories,
        handlers::catalog::post_category,
        handlers::catalog::put_category,
        handlers::catalog::delete_category,
        handlers::catalog::post_categories_import,
        handlers::catalog::post_categories_delete,
        handlers::custom_fields::get_custom_fields,
        handlers::custom_fields::post_custom_field,
        handlers::custom_fields::put_custom_field,
        handlers::custom_fields::delete_custom_field,
        handlers::get_planned_tasks,
        handlers::get_planned_task,
        handlers::post_planned_task,
        handlers::put_planned_task,
        handlers::delete_planned_task,
        handlers::post_planned_task_complete,
        handlers::delete_planned_task_complete,
    ),
    components(schemas(
        models::StatusResponse,
        models::TodayTotals,
        models::TaskDto,
        models::StartTaskRequest,
        models::StopTaskRequest,
        models::ToggleTaskRequest,
        models::ProjectDto,
        models::CategoryDto,
        models::ErrorResponse,
        models::PlannedTaskDto,
        models::PlannedTaskActionDto,
        models::CreatePlannedTaskRequest,
        models::UpdatePlannedTaskRequest,
        models::PlannedTaskCompleteRequest,
        models::CreateProjectRequest,
        models::UpdateProjectRequest,
        models::CreateCategoryRequest,
        models::UpdateCategoryRequest,
        models::ImportCatalogRequest,
        models::ImportCatalogResponse,
        models::DeleteManyRequest,
        models::ProjectCategoryDto,
        models::SetProjectCategoriesRequest,
        models::WorkspaceDto,
        models::CreateWorkspaceRequest,
        models::UpdateWorkspaceRequest,
        models::DeleteWorkspaceRequest,
        models::SetActiveWorkspaceRequest,
        models::CustomFieldDto,
        models::CustomFieldOptionDto,
        models::CreateCustomFieldRequest,
        models::UpdateCustomFieldRequest,
    )),
    tags(
        (name = "status", description = "Consulta de estado"),
        (name = "tasks", description = "Controle de timer"),
        (name = "workspaces", description = "Workspaces e workspace ativo"),
        (name = "catalog", description = "Projetos, categorias e categorias por projeto. \
`workspaceId` ausente = workspace ativo; id de outro workspace = 404."),
        (name = "custom-fields", description = "Campos personalizados (globais, sem workspace)"),
        (name = "planned-tasks", description = "Tarefas planejadas")
    )
)]
pub struct ApiDoc;

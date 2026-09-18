use utoipa::OpenApi;

use crate::api::handlers;
use crate::api::models;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "DeskClock Local API",
        description = "API REST local do DeskClock: controle do timer, Histórico, tarefas planejadas, \
workspaces, projetos, categorias, campos personalizados e totais, para integrar com ferramentas externas \
(Alfred, Raycast, scripts, automações). Cada chamada é executada pelo próprio app, com as mesmas regras da tela.\n\n\
**Base URL:** `http://localhost:{porta}` (padrão: 27420)\n\n\
**Workspace:** onde houver escopo, `workspaceId` ausente = workspace ativo. Recursos buscados por id no path \
(tarefa, planejada) valem em qualquer workspace.\n\n\
**Erros:** 400 = formato ou regra violada; 404 = o recurso do path não existe; 409 = uma referência do corpo \
ou da query não existe, ou o estado atual impede a ação; 503 = o app ainda está carregando.\n\n\
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
        handlers::history::patch_active_task,
        handlers::history::get_tasks,
        handlers::history::post_task,
        handlers::history::get_task,
        handlers::history::put_task,
        handlers::history::delete_task,
        handlers::history::put_task_billable,
        handlers::history::post_tasks_delete,
        handlers::history::post_tasks_merge,
        handlers::history::post_tasks_move,
        handlers::totals::get_totals,
        handlers::totals::get_week_totals,
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
        handlers::planned_tasks::post_planned_task_duplicate,
        handlers::planned_tasks::post_planned_task_start,
        handlers::planned_tasks::post_planned_task_launch_retroactive,
    ),
    components(schemas(
        models::StatusResponse,
        models::TodayTotals,
        models::LocalClock,
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
        models::LaunchPlannedTaskRetroactiveRequest,
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
        models::CreateTaskRequest,
        models::UpdateTaskRequest,
        models::UpdateActiveTaskRequest,
        models::TaskIdsRequest,
        models::SetTaskBillableRequest,
        models::CatalogResolutionDto,
        models::MoveTasksRequest,
        models::MoveMode,
        models::MoveTasksResponse,
        models::PeriodTotalsDto,
        models::WeekTotalsDto,
    )),
    tags(
        (name = "status", description = "Consulta de estado"),
        (name = "tasks", description = "Controle de timer, edição da tarefa ativa e início de uma planejada"),
        (name = "history", description = "Tarefas concluídas: busca, edição, lançamento retroativo, \
unificação e mudança de workspace. Tarefa em execução ou pausada = 409."),
        (name = "totals", description = "Totais por período e por semana. `workspaceId` ausente = workspace ativo."),
        (name = "workspaces", description = "Workspaces e workspace ativo"),
        (name = "catalog", description = "Projetos, categorias e categorias por projeto. \
`workspaceId` ausente = workspace ativo; id de outro workspace = 404."),
        (name = "custom-fields", description = "Campos personalizados (globais, sem workspace)"),
        (name = "planned-tasks", description = "Tarefas planejadas: listagem por dia, período ou todas; CRUD; \
conclusão por dia; duplicar e lançar retroativo. Planejada por id vale em qualquer workspace.")
    )
)]
pub struct ApiDoc;

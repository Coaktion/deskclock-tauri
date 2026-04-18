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
        handlers::get_projects,
        handlers::get_categories,
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
    )),
    tags(
        (name = "status", description = "Consulta de estado"),
        (name = "tasks", description = "Controle de timer"),
        (name = "catalog", description = "Projetos e categorias")
    )
)]
pub struct ApiDoc;

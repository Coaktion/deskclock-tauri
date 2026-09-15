use crate::api::handlers;
use crate::api::handlers::{catalog, custom_fields, workspaces};
use crate::api::openapi::ApiDoc;
use crate::api::state::ApiState;
use axum::{
    http::Method,
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

pub fn build_router(state: Arc<ApiState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    let api = Router::new()
        .route("/status", get(handlers::get_status))
        .route("/tasks/start", post(handlers::post_start))
        .route("/tasks/pause", post(handlers::post_pause))
        .route("/tasks/resume", post(handlers::post_resume))
        .route("/tasks/stop", post(handlers::post_stop))
        .route("/tasks/toggle", post(handlers::post_toggle))
        .route("/tasks/cancel", post(handlers::post_cancel))
        .route(
            "/workspaces",
            get(workspaces::get_workspaces).post(workspaces::post_workspace),
        )
        .route(
            "/workspaces/active",
            get(workspaces::get_active_workspace).put(workspaces::put_active_workspace),
        )
        .route(
            "/workspaces/{id}",
            put(workspaces::put_workspace).delete(workspaces::delete_workspace),
        )
        .route(
            "/projects",
            get(handlers::get_projects).post(catalog::post_project),
        )
        .route("/projects/import", post(catalog::post_projects_import))
        .route("/projects/delete", post(catalog::post_projects_delete))
        .route(
            "/projects/{id}",
            put(catalog::put_project).delete(catalog::delete_project),
        )
        .route(
            "/projects/{id}/categories",
            get(catalog::get_project_categories).put(catalog::put_project_categories),
        )
        .route(
            "/categories",
            get(handlers::get_categories).post(catalog::post_category),
        )
        .route("/categories/import", post(catalog::post_categories_import))
        .route("/categories/delete", post(catalog::post_categories_delete))
        .route(
            "/categories/{id}",
            put(catalog::put_category).delete(catalog::delete_category),
        )
        .route(
            "/custom-fields",
            get(custom_fields::get_custom_fields).post(custom_fields::post_custom_field),
        )
        .route(
            "/custom-fields/{id}",
            put(custom_fields::put_custom_field).delete(custom_fields::delete_custom_field),
        )
        .route(
            "/planned-tasks",
            get(handlers::get_planned_tasks).post(handlers::post_planned_task),
        )
        .route(
            "/planned-tasks/{id}",
            get(handlers::get_planned_task)
                .put(handlers::put_planned_task)
                .delete(handlers::delete_planned_task),
        )
        .route(
            "/planned-tasks/{id}/complete",
            post(handlers::post_planned_task_complete),
        )
        .route(
            "/planned-tasks/{id}/complete/{date}",
            delete(handlers::delete_planned_task_complete),
        )
        .with_state(state);

    Router::new()
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .merge(api)
        .layer(cors)
}

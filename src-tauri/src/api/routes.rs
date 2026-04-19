use crate::api::handlers;
use crate::api::openapi::ApiDoc;
use crate::api::state::ApiState;
use axum::{
    http::Method,
    routing::{delete, get, post},
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
        .route("/projects", get(handlers::get_projects))
        .route("/categories", get(handlers::get_categories))
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

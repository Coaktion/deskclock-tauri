use crate::api::handlers;
use crate::api::handlers::{catalog, custom_fields, history, totals, workspaces};
use crate::api::openapi::ApiDoc;
use crate::api::state::ApiState;
use axum::{
    http::Method,
    routing::{delete, get, patch, post, put},
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
            Method::PATCH,
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
        .route("/tasks/active", patch(history::patch_active_task))
        .route("/tasks", get(history::get_tasks).post(history::post_task))
        .route("/tasks/delete", post(history::post_tasks_delete))
        .route("/tasks/merge", post(history::post_tasks_merge))
        .route("/tasks/move", post(history::post_tasks_move))
        .route(
            "/tasks/{id}",
            get(history::get_task)
                .put(history::put_task)
                .delete(history::delete_task),
        )
        .route("/tasks/{id}/billable", put(history::put_task_billable))
        .route("/totals", get(totals::get_totals))
        .route("/totals/week", get(totals::get_week_totals))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::bridge::Bridge;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use std::sync::Mutex;
    use std::time::Duration;
    use tower::ServiceExt;

    /// Devolve o status e a `op` que chegou à ponte (ou `None`, se o axum
    /// respondeu antes). A ponte nunca responde: cada requisição expira em 504.
    async fn send(method: &str, uri: &str, body: &str) -> (StatusCode, Option<String>) {
        let ops = Arc::new(Mutex::new(Vec::<String>::new()));
        let log = ops.clone();
        let bridge = Bridge::new(
            move |req| {
                log.lock().unwrap().push(req.op.to_string());
                Ok(())
            },
            Duration::from_millis(10),
        );
        bridge.mark_ready();
        let router = build_router(Arc::new(ApiState::new(Arc::new(bridge))));
        let request = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let status = router.oneshot(request).await.unwrap().status();
        let op = ops.lock().unwrap().first().cloned();
        (status, op)
    }

    #[tokio::test]
    async fn rotas_estaticas_de_tasks_vencem_o_parametro_id() {
        let move_body = r#"{"ids":["a"],"toWorkspaceId":"w","project":{"kind":"unset"},"category":{"kind":"match","targetId":"c"},"mode":"copy"}"#;
        let cases = [
            (
                "POST",
                "/tasks/start",
                r#"{"billable":true}"#,
                "tasks.start",
            ),
            ("POST", "/tasks/pause", "", "tasks.pause"),
            ("POST", "/tasks/resume", "", "tasks.resume"),
            ("POST", "/tasks/stop", "", "tasks.stop"),
            ("POST", "/tasks/toggle", "", "tasks.toggle"),
            ("POST", "/tasks/cancel", "", "tasks.cancel"),
            ("PATCH", "/tasks/active", "{}", "tasks.updateActive"),
            (
                "POST",
                "/tasks/delete",
                r#"{"ids":[]}"#,
                "history.deleteMany",
            ),
            ("POST", "/tasks/merge", r#"{"ids":[]}"#, "history.merge"),
            ("POST", "/tasks/move", move_body, "history.move"),
            ("GET", "/tasks", "", "history.list"),
            (
                "POST",
                "/tasks",
                r#"{"billable":true,"startTime":"a","endTime":"b"}"#,
                "history.create",
            ),
            ("GET", "/tasks/abc", "", "history.get"),
            ("PUT", "/tasks/abc", "{}", "history.update"),
            ("DELETE", "/tasks/abc", "", "history.delete"),
            (
                "PUT",
                "/tasks/abc/billable",
                r#"{"billable":false}"#,
                "history.setBillable",
            ),
            ("GET", "/totals", "", "totals.period"),
            ("GET", "/totals/week", "", "totals.week"),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn metodo_errado_numa_rota_estatica_nao_cai_no_id() {
        for (method, uri) in [
            ("GET", "/tasks/active"),
            ("DELETE", "/tasks/active"),
            ("GET", "/tasks/delete"),
            ("PUT", "/tasks/merge"),
            ("GET", "/tasks/move"),
        ] {
            let (status, got) = send(method, uri, "").await;
            assert_eq!(got, None, "{method} {uri}");
            assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn mode_fora_de_move_e_copy_e_400_sem_chegar_a_ponte() {
        let body = r#"{"ids":["a"],"toWorkspaceId":"w","project":{"kind":"unset"},"category":{"kind":"unset"},"mode":"Move"}"#;
        let (status, got) = send("POST", "/tasks/move", body).await;
        assert_eq!(got, None);
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn resolucao_de_catalogo_malformada_e_400_sem_chegar_a_ponte() {
        let body = r#"{"ids":["a"],"toWorkspaceId":"w","project":{"kind":"match"},"category":{"kind":"unset"},"mode":"move"}"#;
        let (status, got) = send("POST", "/tasks/move", body).await;
        assert_eq!(got, None);
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
}

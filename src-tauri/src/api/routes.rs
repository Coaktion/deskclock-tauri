use crate::api::guard::reject_foreign_origin;
use crate::api::handlers;
use crate::api::handlers::{
    catalog, custom_fields, entry_writes, export, history, imports, integrations, planned_tasks,
    services, totals, workspaces,
};
use crate::api::openapi::ApiDoc;
use crate::api::state::ApiState;
use crate::mcp;
use axum::{
    middleware,
    routing::{delete, get, patch, post, put},
    Router,
};
use std::sync::Arc;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

pub fn build_router(state: Arc<ApiState>) -> Router {
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
                .patch(handlers::patch_planned_task)
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
        .route(
            "/planned-tasks/{id}/duplicate",
            post(planned_tasks::post_planned_task_duplicate),
        )
        .route(
            "/planned-tasks/{id}/start",
            post(planned_tasks::post_planned_task_start),
        )
        .route(
            "/planned-tasks/{id}/launch-retroactive",
            post(planned_tasks::post_planned_task_launch_retroactive),
        )
        .route(
            "/integrations/{id}/send-preview",
            get(integrations::get_send_preview),
        )
        .route("/integrations/{id}/send", post(integrations::post_send))
        .route(
            "/integrations/google_calendar/import-preview",
            get(imports::get_calendar_import_preview),
        )
        .route(
            "/integrations/google_calendar/import",
            post(imports::post_calendar_import),
        )
        .route(
            "/integrations/zendesk/import-preview",
            get(imports::get_zendesk_import_preview),
        )
        .route(
            "/integrations/zendesk/import",
            post(imports::post_zendesk_import),
        )
        .route(
            "/integrations/monday/import-preview",
            get(imports::get_monday_import_preview),
        )
        .route(
            "/integrations/monday/import",
            post(imports::post_monday_import),
        )
        .route(
            "/integrations/monday/import-projects",
            post(imports::post_monday_import_projects),
        )
        .route(
            "/integrations/monday/import-categories",
            post(imports::post_monday_import_categories),
        )
        .route(
            "/integrations/monday/read-catalogs",
            post(imports::post_monday_read_catalogs),
        )
        .route(
            "/export-profiles",
            get(export::get_export_profiles).post(export::post_export_profile),
        )
        .route(
            "/export-profiles/{id}",
            put(export::put_export_profile).delete(export::delete_export_profile),
        )
        .route(
            "/export-profiles/{id}/default",
            put(export::put_export_profile_default),
        )
        .route("/export", post(export::post_export))
        .route(
            "/integrations/clockify/entries",
            get(services::get_clockify_entries).post(entry_writes::post_clockify_entry),
        )
        .route(
            "/integrations/clockify/entries/{id}",
            put(entry_writes::put_clockify_entry).delete(entry_writes::delete_clockify_entry),
        )
        .route(
            "/integrations/monday/entries",
            get(services::get_monday_entries),
        )
        .route(
            "/integrations/monday/entries/{id}",
            put(entry_writes::put_monday_entry).delete(entry_writes::delete_monday_entry),
        )
        .route("/day-summaries", get(services::get_day_summaries))
        .route(
            "/day-summaries/generate",
            post(services::post_day_summaries_generate),
        )
        .route("/backup/drive", get(services::get_drive_backup))
        .route("/backup/drive/run", post(services::post_drive_backup_run))
        .with_state(state.clone());

    Router::new()
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .merge(api)
        .route_service("/mcp", mcp::service(state))
        .layer(middleware::from_fn(reject_foreign_origin))
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
    async fn acoes_da_planejada_chegam_a_ponte_com_a_op_certa() {
        let cases = [
            (
                "GET",
                "/planned-tasks?from=2026-09-14&to=2026-09-18",
                "",
                "plannedTasks.list",
            ),
            (
                "POST",
                "/planned-tasks/abc/duplicate",
                "",
                "plannedTasks.duplicate",
            ),
            ("POST", "/planned-tasks/abc/start", "", "tasks.startPlanned"),
            (
                "PATCH",
                "/planned-tasks/abc",
                r#"{"customValues":{"f":"x"}}"#,
                "plannedTasks.patch",
            ),
            (
                "PATCH",
                "/planned-tasks/abc",
                r#"{"startTime":null,"customValues":null,"actions":null}"#,
                "plannedTasks.patch",
            ),
            (
                "PUT",
                "/planned-tasks/abc",
                r#"{"name":"a","billable":true,"scheduleType":"recurring"}"#,
                "plannedTasks.update",
            ),
            (
                "POST",
                "/planned-tasks/abc/launch-retroactive",
                "",
                "plannedTasks.launchRetroactive",
            ),
            (
                "POST",
                "/planned-tasks/abc/launch-retroactive",
                r#"{"date":"2026-09-15","startTime":"a","endTime":"b"}"#,
                "plannedTasks.launchRetroactive",
            ),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn patch_da_planejada_com_tipo_errado_e_400_sem_chegar_a_ponte() {
        for body in ["", r#"{"name":5}"#, r#"{"recurringDays":"seg"}"#] {
            let (status, got) = send("PATCH", "/planned-tasks/abc", body).await;
            assert_eq!(got, None, "{body}");
            assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        }
    }

    #[tokio::test]
    async fn envio_as_integracoes_chega_a_ponte_com_a_op_certa() {
        let cases = [
            (
                "GET",
                "/integrations/monday/send-preview?from=2026-09-14&to=2026-09-18",
                "",
                "integrations.sendPreview",
            ),
            (
                "POST",
                "/integrations/clockify/send",
                r#"{"taskIds":["a","b"]}"#,
                "integrations.send",
            ),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn envio_sem_corpo_ou_com_task_ids_fora_do_formato_e_400_sem_chegar_a_ponte() {
        for body in ["", "{}", r#"{"taskIds":"a"}"#, r#"{"taskIds":[1]}"#] {
            let (status, got) = send("POST", "/integrations/monday/send", body).await;
            assert_eq!(got, None, "{body}");
            assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        }
    }

    #[tokio::test]
    async fn exportacao_chega_a_ponte_com_a_op_certa() {
        let cases = [
            ("GET", "/export-profiles", "", "exportProfiles.list"),
            (
                "GET",
                "/export-profiles?workspaceId=w",
                "",
                "exportProfiles.list",
            ),
            (
                "POST",
                "/export-profiles",
                r#"{"name":"Cliente","columns":[{"field":"name","label":"Nome","visible":true,"order":0}]}"#,
                "exportProfiles.create",
            ),
            (
                "PUT",
                "/export-profiles/abc",
                r#"{"format":"json"}"#,
                "exportProfiles.update",
            ),
            (
                "DELETE",
                "/export-profiles/abc",
                "",
                "exportProfiles.delete",
            ),
            (
                "PUT",
                "/export-profiles/abc/default",
                "",
                "exportProfiles.setDefault",
            ),
            ("POST", "/export", "", "export.generate"),
            (
                "POST",
                "/export",
                r#"{"from":"2026-10-01","to":"2026-10-31","taskIds":["a"]}"#,
                "export.generate",
            ),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn exportacao_com_corpo_fora_do_formato_e_400_sem_chegar_a_ponte() {
        let cases = [
            ("POST", "/export-profiles", ""),
            ("POST", "/export-profiles", "{}"),
            (
                "POST",
                "/export-profiles",
                r#"{"name":"a","columns":[{"field":"name"}]}"#,
            ),
            ("PUT", "/export-profiles/abc", ""),
            ("PUT", "/export-profiles/abc", r#"{"isDefault":"sim"}"#),
            ("POST", "/export", r#"{"taskIds":"a"}"#),
            ("POST", "/export", r#"{"from":20261001}"#),
        ];
        for (method, uri, body) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got, None, "{method} {uri} {body}");
            assert_eq!(status, StatusCode::BAD_REQUEST, "{method} {uri} {body}");
        }
    }

    #[tokio::test]
    async fn imports_chegam_a_ponte_com_a_op_certa() {
        let cases = [
            (
                "GET",
                "/integrations/google_calendar/import-preview?from=2026-09-14&to=2026-09-20",
                "",
                "calendar.importPreview",
            ),
            (
                "POST",
                "/integrations/google_calendar/import",
                r#"{"events":[{"id":"e1","projectId":null,"recurringDays":[1,3]}],"trackMeetings":true}"#,
                "calendar.import",
            ),
            (
                "GET",
                "/integrations/zendesk/import-preview",
                "",
                "zendesk.importPreview",
            ),
            (
                "POST",
                "/integrations/zendesk/import",
                r#"{"tickets":[{"id":42,"scheduleType":"specific_date"}]}"#,
                "zendesk.import",
            ),
            (
                "GET",
                "/integrations/monday/import-preview?period=next30",
                "",
                "monday.importPreview",
            ),
            (
                "POST",
                "/integrations/monday/import",
                r#"{"items":[{"id":"123","projectStage":"UAT"}]}"#,
                "monday.import",
            ),
            (
                "POST",
                "/integrations/monday/import-projects",
                "",
                "monday.importProjects",
            ),
            (
                "POST",
                "/integrations/monday/import-categories",
                "",
                "monday.importCategories",
            ),
            (
                "POST",
                "/integrations/monday/read-catalogs",
                "",
                "monday.readCatalogs",
            ),
            // As rotas fixas do Monday convivem com as de `{id}` do envio.
            (
                "GET",
                "/integrations/monday/send-preview",
                "",
                "integrations.sendPreview",
            ),
            (
                "POST",
                "/integrations/monday/send",
                r#"{"taskIds":["a"]}"#,
                "integrations.send",
            ),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn fase_d2_chega_a_ponte_com_a_op_certa() {
        let cases = [
            (
                "GET",
                "/integrations/clockify/entries?from=2026-09-14&to=2026-09-18&onlyDefaultTags=false",
                "",
                "clockify.entries",
            ),
            (
                "GET",
                "/integrations/monday/entries?period=30days",
                "",
                "monday.entries",
            ),
            (
                "GET",
                "/day-summaries?from=2026-09-14&to=2026-09-18",
                "",
                "daySummaries.list",
            ),
            ("POST", "/day-summaries/generate", "", "daySummaries.generate"),
            (
                "POST",
                "/day-summaries/generate",
                r#"{"from":"2026-09-14","billable":true}"#,
                "daySummaries.generate",
            ),
            ("GET", "/backup/drive", "", "driveBackup.status"),
            ("POST", "/backup/drive/run", "", "driveBackup.run"),
            // A rota fixa do Clockify convive com as de `{id}` do envio.
            (
                "GET",
                "/integrations/clockify/send-preview",
                "",
                "integrations.sendPreview",
            ),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn fase_d2b_chega_a_ponte_com_a_op_certa() {
        let clockify = r#"{"description":"Revisão","projectName":"ACME - Site","date":"2026-09-15","start":"09:00","end":"10:30"}"#;
        let cases = [
            (
                "POST",
                "/integrations/clockify/entries",
                clockify,
                "clockify.createEntry",
            ),
            (
                "PUT",
                "/integrations/clockify/entries/e1",
                clockify,
                "clockify.updateEntry",
            ),
            (
                "DELETE",
                "/integrations/clockify/entries/e1",
                "",
                "clockify.deleteEntry",
            ),
            (
                "PUT",
                "/integrations/monday/entries/123",
                r#"{"hours":2.5,"activityType":null}"#,
                "monday.updateEntry",
            ),
            // Corpo vazio na edição do Monday: nada muda, como Salvar sem mexer.
            (
                "PUT",
                "/integrations/monday/entries/123",
                "",
                "monday.updateEntry",
            ),
            (
                "DELETE",
                "/integrations/monday/entries/123",
                "",
                "monday.deleteEntry",
            ),
            // A leitura continua no mesmo caminho do POST.
            (
                "GET",
                "/integrations/clockify/entries",
                "",
                "clockify.entries",
            ),
        ];
        for (method, uri, body, op) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got.as_deref(), Some(op), "{method} {uri}");
            assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{method} {uri}");
        }
    }

    #[tokio::test]
    async fn escrita_nos_lancamentos_fora_do_formato_e_400_sem_chegar_a_ponte() {
        let cases = [
            ("POST", "/integrations/clockify/entries", ""),
            (
                "POST",
                "/integrations/clockify/entries",
                r#"{"description":"x","date":"2026-09-15","start":"09:00"}"#,
            ),
            (
                "PUT",
                "/integrations/clockify/entries/e1",
                r#"{"description":"x","date":"2026-09-15","start":"09:00","end":"10:00","tagIds":"t1"}"#,
            ),
            (
                "PUT",
                "/integrations/monday/entries/123",
                r#"{"hours":"duas"}"#,
            ),
            (
                "PUT",
                "/integrations/monday/entries/123",
                r#"{"billable":"sim"}"#,
            ),
        ];
        for (method, uri, body) in cases {
            let (status, got) = send(method, uri, body).await;
            assert_eq!(got, None, "{method} {uri} {body}");
            assert_eq!(status, StatusCode::BAD_REQUEST, "{method} {uri} {body}");
        }
    }

    #[tokio::test]
    async fn geracao_de_resumos_com_filtro_fora_do_formato_e_400_sem_chegar_a_ponte() {
        for body in [r#"{"billable":"sim"}"#, r#"{"from":20260914}"#] {
            let (status, got) = send("POST", "/day-summaries/generate", body).await;
            assert_eq!(got, None, "{body}");
            assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        }
    }

    #[tokio::test]
    async fn import_sem_corpo_ou_com_lista_fora_do_formato_e_400_sem_chegar_a_ponte() {
        let cases = [
            ("/integrations/google_calendar/import", ""),
            ("/integrations/google_calendar/import", "{}"),
            (
                "/integrations/google_calendar/import",
                r#"{"events":["e1"]}"#,
            ),
            (
                "/integrations/google_calendar/import",
                r#"{"events":[{"id":1}]}"#,
            ),
            (
                "/integrations/zendesk/import",
                r#"{"tickets":[{"id":"42"}]}"#,
            ),
            ("/integrations/monday/import", r#"{"items":"123"}"#),
        ];
        for (uri, body) in cases {
            let (status, got) = send("POST", uri, body).await;
            assert_eq!(got, None, "{uri} {body}");
            assert_eq!(status, StatusCode::BAD_REQUEST, "{uri} {body}");
        }
    }

    #[tokio::test]
    async fn reorder_nao_e_exposto() {
        let (status, got) = send("POST", "/planned-tasks/reorder", r#"{"ids":[]}"#).await;
        assert_eq!(got, None);
        assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);
    }

    #[tokio::test]
    async fn lancamento_retroativo_com_data_nao_textual_e_400_sem_chegar_a_ponte() {
        let (status, got) = send(
            "POST",
            "/planned-tasks/abc/launch-retroactive",
            r#"{"date":20260915}"#,
        )
        .await;
        assert_eq!(got, None);
        assert_eq!(status, StatusCode::BAD_REQUEST);
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

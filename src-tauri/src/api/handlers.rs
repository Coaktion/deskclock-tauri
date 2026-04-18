use crate::api::db::{new_uuid, now_iso_utc, task_record_to_dto, Db, TaskRecord};
use crate::api::models::{
    CategoryDto, ErrorResponse, ProjectDto, StartTaskRequest, StatusResponse, StopTaskRequest,
    TaskDto, ToggleTaskRequest,
};
use crate::api::state::ApiState;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;
use tauri::Emitter;

pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, msg: impl Into<String>) -> Self {
        Self {
            status,
            message: msg.into(),
        }
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, msg)
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, msg)
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, msg)
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        ApiError::internal(format!("SQLite error: {e}"))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

fn emit_running_task_changed(state: &ApiState, task: Option<&TaskDto>) {
    // O frontend tem filtros de `source` assimétricos: o overlay ignora
    // `source === "overlay"` e a janela principal ignora qualquer coisa
    // diferente de `"overlay"`. Para alcançar as duas janelas sem tocar no
    // frontend, emitimos o mesmo payload duas vezes com sources distintos.
    let base_payload = |source: &str| {
        json!({
            "task": task,
            "source": source,
        })
    };
    let _ = state
        .app_handle
        .emit("running-task-changed", base_payload("api"));
    let _ = state
        .app_handle
        .emit("running-task-changed", base_payload("overlay"));
}

fn build_task_dto(db: &Db, task: &TaskRecord) -> rusqlite::Result<TaskDto> {
    let project_name = match &task.project_id {
        Some(id) => db.find_project_name(id)?,
        None => None,
    };
    let category_name = match &task.category_id {
        Some(id) => db.find_category_name(id)?,
        None => None,
    };
    Ok(task_record_to_dto(task, project_name, category_name))
}

// ---------------- GET /status ----------------

#[utoipa::path(
    get,
    path = "/status",
    tag = "status",
    responses(
        (status = 200, description = "Estado atual do timer e totais do dia", body = StatusResponse)
    )
)]
pub async fn get_status(State(state): State<Arc<ApiState>>) -> ApiResult<Json<StatusResponse>> {
    let db = state.open_db()?;
    let today = db.today_totals()?;
    let active = db.active_task()?;
    let (running, task_dto) = match active {
        Some(t) => {
            let is_running = t.status == "running";
            let dto = build_task_dto(&db, &t)?;
            (is_running, Some(dto))
        }
        None => (false, None),
    };
    Ok(Json(StatusResponse {
        running,
        task: task_dto,
        today,
    }))
}

// ---------------- POST /tasks/start ----------------

#[utoipa::path(
    post,
    path = "/tasks/start",
    tag = "tasks",
    request_body = StartTaskRequest,
    responses(
        (status = 201, description = "Tarefa iniciada", body = TaskDto),
        (status = 409, description = "Projeto/categoria não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_start(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<StartTaskRequest>,
) -> ApiResult<(StatusCode, Json<TaskDto>)> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;

    let project_id = resolve_project(&db, req.project_id, req.project_name)?;
    let category_id = resolve_category(&db, req.category_id, req.category_name)?;

    let now = now_iso_utc();
    db.complete_all_active(&now)?;

    let task = TaskRecord {
        id: new_uuid(),
        name: req.name,
        project_id,
        category_id,
        billable: req.billable,
        start_time: now.clone(),
        end_time: None,
        duration_seconds: Some(0),
        status: "running".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    db.insert_task(&task)?;
    let dto = build_task_dto(&db, &task)?;
    emit_running_task_changed(&state, Some(&dto));
    Ok((StatusCode::CREATED, Json(dto)))
}

// ---------------- POST /tasks/pause ----------------

#[utoipa::path(
    post,
    path = "/tasks/pause",
    tag = "tasks",
    responses(
        (status = 200, description = "Tarefa pausada", body = TaskDto),
        (status = 404, description = "Nenhuma tarefa em execução", body = ErrorResponse)
    )
)]
pub async fn post_pause(State(state): State<Arc<ApiState>>) -> ApiResult<Json<TaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;
    let active = db
        .active_task()?
        .ok_or_else(|| ApiError::not_found("Nenhuma tarefa em execução"))?;
    if active.status != "running" {
        return Err(ApiError::not_found("Tarefa ativa não está em execução"));
    }
    let now = now_iso_utc();
    let elapsed = crate::api::db::seconds_between(&active.start_time, &now).max(0);
    let mut updated = active.clone();
    updated.status = "paused".to_string();
    updated.duration_seconds = Some(active.duration_seconds.unwrap_or(0) + elapsed);
    updated.start_time = now.clone();
    updated.updated_at = now;
    db.update_task(&updated)?;
    let dto = build_task_dto(&db, &updated)?;
    emit_running_task_changed(&state, Some(&dto));
    Ok(Json(dto))
}

// ---------------- POST /tasks/resume ----------------

#[utoipa::path(
    post,
    path = "/tasks/resume",
    tag = "tasks",
    responses(
        (status = 200, description = "Tarefa retomada", body = TaskDto),
        (status = 404, description = "Nenhuma tarefa pausada", body = ErrorResponse)
    )
)]
pub async fn post_resume(State(state): State<Arc<ApiState>>) -> ApiResult<Json<TaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;
    let active = db
        .active_task()?
        .ok_or_else(|| ApiError::not_found("Nenhuma tarefa pausada"))?;
    if active.status != "paused" {
        return Err(ApiError::not_found("Tarefa ativa não está pausada"));
    }
    let now = now_iso_utc();
    // Conclui qualquer running remanescente antes de retomar.
    // (Segurança: neste ponto active_task retornaria running antes de paused.)
    let mut updated = active.clone();
    updated.status = "running".to_string();
    updated.start_time = now.clone();
    updated.updated_at = now;
    db.update_task(&updated)?;
    let dto = build_task_dto(&db, &updated)?;
    emit_running_task_changed(&state, Some(&dto));
    Ok(Json(dto))
}

// ---------------- POST /tasks/stop ----------------

#[utoipa::path(
    post,
    path = "/tasks/stop",
    tag = "tasks",
    request_body = StopTaskRequest,
    responses(
        (status = 200, description = "Tarefa parada", body = TaskDto),
        (status = 404, description = "Nenhuma tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn post_stop(
    State(state): State<Arc<ApiState>>,
    body: Option<Json<StopTaskRequest>>,
) -> ApiResult<Json<TaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let _completed = body.map(|Json(b)| b.completed).unwrap_or(true);
    let db = state.open_db()?;
    let active = db
        .active_task()?
        .ok_or_else(|| ApiError::not_found("Nenhuma tarefa ativa"))?;
    let now = now_iso_utc();
    let total = crate::api::db::effective_duration(&active, &now);
    let mut updated = active.clone();
    updated.status = "completed".to_string();
    updated.end_time = Some(now.clone());
    updated.duration_seconds = Some(total);
    updated.updated_at = now;
    db.update_task(&updated)?;
    let dto = build_task_dto(&db, &updated)?;
    emit_running_task_changed(&state, None);
    Ok(Json(dto))
}

// ---------------- POST /tasks/toggle ----------------

#[utoipa::path(
    post,
    path = "/tasks/toggle",
    tag = "tasks",
    request_body = Option<ToggleTaskRequest>,
    responses(
        (status = 200, description = "Novo estado da tarefa", body = TaskDto)
    )
)]
pub async fn post_toggle(
    State(state): State<Arc<ApiState>>,
    body: Option<Json<ToggleTaskRequest>>,
) -> ApiResult<Json<TaskDto>> {
    let db = state.open_db()?;
    let active = db.active_task()?;
    drop(db);

    match active {
        Some(t) if t.status == "running" => {
            let res = post_pause(State(state.clone())).await?;
            Ok(res)
        }
        Some(t) if t.status == "paused" => {
            let res = post_resume(State(state.clone())).await?;
            Ok(res)
        }
        _ => {
            let req = body.map(|Json(b)| b).unwrap_or(ToggleTaskRequest {
                name: None,
                project_id: None,
                project_name: None,
                category_id: None,
                category_name: None,
                billable: true,
            });
            let start_req = StartTaskRequest {
                name: req.name,
                project_id: req.project_id,
                project_name: req.project_name,
                category_id: req.category_id,
                category_name: req.category_name,
                billable: req.billable,
            };
            let (_status, dto) = post_start(State(state), Json(start_req)).await?;
            Ok(dto)
        }
    }
}

// ---------------- GET /projects ----------------

#[utoipa::path(
    get,
    path = "/projects",
    tag = "catalog",
    responses(
        (status = 200, description = "Lista de projetos", body = Vec<ProjectDto>)
    )
)]
pub async fn get_projects(
    State(state): State<Arc<ApiState>>,
) -> ApiResult<Json<Vec<ProjectDto>>> {
    let db = state.open_db()?;
    Ok(Json(db.list_projects()?))
}

// ---------------- GET /categories ----------------

#[utoipa::path(
    get,
    path = "/categories",
    tag = "catalog",
    responses(
        (status = 200, description = "Lista de categorias", body = Vec<CategoryDto>)
    )
)]
pub async fn get_categories(
    State(state): State<Arc<ApiState>>,
) -> ApiResult<Json<Vec<CategoryDto>>> {
    let db = state.open_db()?;
    Ok(Json(db.list_categories()?))
}

// ---------------- Helpers ----------------

fn resolve_project(
    db: &Db,
    id: Option<String>,
    name: Option<String>,
) -> ApiResult<Option<String>> {
    if let Some(id) = id {
        if db.find_project_name(&id)?.is_none() {
            return Err(ApiError::conflict(format!(
                "Projeto com id '{id}' não encontrado"
            )));
        }
        return Ok(Some(id));
    }
    if let Some(name) = name {
        return match db.find_project_id_by_name(&name)? {
            Some(id) => Ok(Some(id)),
            None => Err(ApiError::conflict(format!(
                "Projeto com nome '{name}' não encontrado"
            ))),
        };
    }
    Ok(None)
}

fn resolve_category(
    db: &Db,
    id: Option<String>,
    name: Option<String>,
) -> ApiResult<Option<String>> {
    if let Some(id) = id {
        if db.find_category_name(&id)?.is_none() {
            return Err(ApiError::conflict(format!(
                "Categoria com id '{id}' não encontrada"
            )));
        }
        return Ok(Some(id));
    }
    if let Some(name) = name {
        return match db.find_category_id_by_name(&name)? {
            Some(id) => Ok(Some(id)),
            None => Err(ApiError::conflict(format!(
                "Categoria com nome '{name}' não encontrada"
            ))),
        };
    }
    Ok(None)
}

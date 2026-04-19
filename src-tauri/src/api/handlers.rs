use crate::api::db::{new_uuid, now_iso_utc, task_record_to_dto, Db, PlannedTaskRecord, TaskRecord};
use crate::api::models::{
    CategoryDto, CreatePlannedTaskRequest, ErrorResponse, PlannedTaskActionDto,
    PlannedTaskCompleteRequest, PlannedTaskDto, ProjectDto, StartTaskRequest, StatusResponse,
    StopTaskRequest, TaskDto, ToggleTaskRequest, UpdatePlannedTaskRequest,
};
use crate::api::state::ApiState;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
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

// Aceita corpo ausente, vazio ou `null` — todos tratados como None.
fn parse_optional_body<T: serde::de::DeserializeOwned>(body: &Bytes) -> ApiResult<Option<T>> {
    if body.is_empty() || body.as_ref() == b"null" {
        return Ok(None);
    }
    serde_json::from_slice(body)
        .map(Some)
        .map_err(|e| ApiError::new(StatusCode::BAD_REQUEST, format!("JSON inválido: {e}")))
}

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
    request_body(
        content = StartTaskRequest,
        description = "Dados da nova tarefa. Todos os campos são opcionais exceto `billable`.",
        example = json!({
            "name": "Reunião de planejamento",
            "projectName": "Meu Projeto",
            "categoryName": "Reuniões",
            "billable": true
        })
    ),
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
    request_body(
        content = StopTaskRequest,
        description = "Opcional — corpo pode ser omitido. `completed` define se a tarefa foi concluída (padrão: true).",
        example = json!({ "completed": true })
    ),
    responses(
        (status = 200, description = "Tarefa parada", body = TaskDto),
        (status = 404, description = "Nenhuma tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn post_stop(
    State(state): State<Arc<ApiState>>,
    body: Bytes,
) -> ApiResult<Json<TaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let req: Option<StopTaskRequest> = parse_optional_body(&body)?;
    let _completed = req.map(|r| r.completed).unwrap_or(true);
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
    request_body(
        content = ToggleTaskRequest,
        description = "Opcional — pode ser omitido ou enviado como `{}`. \
            Se houver tarefa em execução: pausa. Se estiver pausada: retoma. \
            Se não houver tarefa ativa: inicia nova com os dados fornecidos.",
        example = json!({
            "name": "Revisão de código",
            "projectName": "Meu Projeto",
            "billable": true
        })
    ),
    responses(
        (status = 200, description = "Novo estado da tarefa", body = TaskDto)
    )
)]
pub async fn post_toggle(
    State(state): State<Arc<ApiState>>,
    body: Bytes,
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
            let req = parse_optional_body::<ToggleTaskRequest>(&body)?.unwrap_or_default();
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

// ---------------- POST /tasks/cancel ----------------

#[utoipa::path(
    post,
    path = "/tasks/cancel",
    tag = "tasks",
    responses(
        (status = 204, description = "Tarefa cancelada e removida"),
        (status = 404, description = "Nenhuma tarefa ativa", body = ErrorResponse)
    )
)]
pub async fn post_cancel(State(state): State<Arc<ApiState>>) -> ApiResult<StatusCode> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;
    let active = db
        .active_task()?
        .ok_or_else(|| ApiError::not_found("Nenhuma tarefa ativa"))?;
    db.delete_task(&active.id)?;
    emit_running_task_changed(&state, None);
    Ok(StatusCode::NO_CONTENT)
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

// ================================================================
// PlannedTask helpers
// ================================================================

fn planned_task_record_to_dto(
    task: &PlannedTaskRecord,
    project_name: Option<String>,
    category_name: Option<String>,
) -> PlannedTaskDto {
    PlannedTaskDto {
        id: task.id.clone(),
        name: task.name.clone(),
        project_id: task.project_id.clone(),
        project_name,
        category_id: task.category_id.clone(),
        category_name,
        billable: task.billable,
        schedule_type: task.schedule_type.clone(),
        schedule_date: task.schedule_date.clone(),
        recurring_days: task
            .recurring_days
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok()),
        period_start: task.period_start.clone(),
        period_end: task.period_end.clone(),
        completed_dates: serde_json::from_str(&task.completed_dates).unwrap_or_default(),
        actions: serde_json::from_str::<Vec<PlannedTaskActionDto>>(&task.actions)
            .unwrap_or_default(),
        sort_order: task.sort_order,
        created_at: task.created_at.clone(),
    }
}

fn build_planned_task_dto(db: &Db, task: &PlannedTaskRecord) -> ApiResult<PlannedTaskDto> {
    let project_name = match &task.project_id {
        Some(id) => db.find_project_name(id)?,
        None => None,
    };
    let category_name = match &task.category_id {
        Some(id) => db.find_category_name(id)?,
        None => None,
    };
    Ok(planned_task_record_to_dto(task, project_name, category_name))
}

// ================================================================
// GET /planned-tasks
// ================================================================

#[derive(serde::Deserialize)]
pub struct PlannedTasksQuery {
    date: Option<String>,
}

#[utoipa::path(
    get,
    path = "/planned-tasks",
    tag = "planned-tasks",
    params(
        ("date" = Option<String>, Query, description = "Filtrar por data YYYY-MM-DD (aplica regras de recorrência). Se omitido, retorna todas.")
    ),
    responses(
        (status = 200, description = "Lista de tarefas planejadas", body = Vec<PlannedTaskDto>)
    )
)]
pub async fn get_planned_tasks(
    State(state): State<Arc<ApiState>>,
    Query(q): Query<PlannedTasksQuery>,
) -> ApiResult<Json<Vec<PlannedTaskDto>>> {
    let db = state.open_db()?;
    let records = match q.date {
        Some(ref date) => db.list_planned_tasks_for_date(date)?,
        None => db.list_planned_tasks()?,
    };
    let dtos: Vec<PlannedTaskDto> = records
        .iter()
        .map(|t| build_planned_task_dto(&db, t))
        .collect::<ApiResult<_>>()?;
    Ok(Json(dtos))
}

// ================================================================
// GET /planned-tasks/:id
// ================================================================

#[utoipa::path(
    get,
    path = "/planned-tasks/{id}",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    responses(
        (status = 200, description = "Tarefa planejada", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn get_planned_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> ApiResult<Json<PlannedTaskDto>> {
    let db = state.open_db()?;
    let task = db
        .find_planned_task(&id)?
        .ok_or_else(|| ApiError::not_found(format!("Tarefa planejada '{id}' não encontrada")))?;
    Ok(Json(build_planned_task_dto(&db, &task)?))
}

// ================================================================
// POST /planned-tasks
// ================================================================

#[utoipa::path(
    post,
    path = "/planned-tasks",
    tag = "planned-tasks",
    request_body(
        content = CreatePlannedTaskRequest,
        description = "Dados da nova tarefa planejada.",
        example = json!({
            "name": "Daily standup",
            "categoryName": "Reuniões",
            "billable": false,
            "scheduleType": "recurring",
            "recurringDays": [1, 2, 3, 4, 5]
        })
    ),
    responses(
        (status = 201, description = "Tarefa planejada criada", body = PlannedTaskDto),
        (status = 409, description = "Projeto/categoria não encontrado", body = ErrorResponse)
    )
)]
pub async fn post_planned_task(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<CreatePlannedTaskRequest>,
) -> ApiResult<(StatusCode, Json<PlannedTaskDto>)> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;

    let project_id = resolve_project(&db, req.project_id, req.project_name)?;
    let category_id = resolve_category(&db, req.category_id, req.category_name)?;

    let sort_order = req
        .sort_order
        .unwrap_or_else(|| db.max_planned_task_sort_order().unwrap_or(-1) + 1);

    let recurring_days_json = req
        .recurring_days
        .as_ref()
        .map(|d| serde_json::to_string(d).unwrap_or_else(|_| "null".to_string()));

    let actions_json =
        serde_json::to_string(&req.actions).unwrap_or_else(|_| "[]".to_string());

    let now = now_iso_utc();
    let task = PlannedTaskRecord {
        id: new_uuid(),
        name: req.name,
        project_id,
        category_id,
        billable: req.billable,
        schedule_type: req.schedule_type,
        schedule_date: req.schedule_date,
        recurring_days: recurring_days_json,
        period_start: req.period_start,
        period_end: req.period_end,
        completed_dates: "[]".to_string(),
        actions: actions_json,
        sort_order,
        created_at: now,
    };
    db.insert_planned_task(&task)?;
    let dto = build_planned_task_dto(&db, &task)?;
    Ok((StatusCode::CREATED, Json(dto)))
}

// ================================================================
// PUT /planned-tasks/:id
// ================================================================

#[utoipa::path(
    put,
    path = "/planned-tasks/{id}",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    request_body(
        content = UpdatePlannedTaskRequest,
        description = "Substitui todos os campos atualizáveis da tarefa planejada. `completedDates` é preservado.",
        example = json!({
            "name": "Daily standup",
            "billable": false,
            "scheduleType": "recurring",
            "recurringDays": [1, 2, 3, 4, 5],
            "actions": []
        })
    ),
    responses(
        (status = 200, description = "Tarefa planejada atualizada", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse),
        (status = 409, description = "Projeto/categoria não encontrado", body = ErrorResponse)
    )
)]
pub async fn put_planned_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdatePlannedTaskRequest>,
) -> ApiResult<Json<PlannedTaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;

    let existing = db
        .find_planned_task(&id)?
        .ok_or_else(|| ApiError::not_found(format!("Tarefa planejada '{id}' não encontrada")))?;

    let project_id = resolve_project(&db, req.project_id, req.project_name)?;
    let category_id = resolve_category(&db, req.category_id, req.category_name)?;

    let recurring_days_json = req
        .recurring_days
        .as_ref()
        .map(|d| serde_json::to_string(d).unwrap_or_else(|_| "null".to_string()));

    let actions_json =
        serde_json::to_string(&req.actions).unwrap_or_else(|_| "[]".to_string());

    let updated = PlannedTaskRecord {
        id: existing.id.clone(),
        name: req.name,
        project_id,
        category_id,
        billable: req.billable,
        schedule_type: req.schedule_type,
        schedule_date: req.schedule_date,
        recurring_days: recurring_days_json,
        period_start: req.period_start,
        period_end: req.period_end,
        completed_dates: existing.completed_dates.clone(),
        actions: actions_json,
        sort_order: req.sort_order.unwrap_or(existing.sort_order),
        created_at: existing.created_at.clone(),
    };
    db.update_planned_task(&updated)?;
    Ok(Json(build_planned_task_dto(&db, &updated)?))
}

// ================================================================
// DELETE /planned-tasks/:id
// ================================================================

#[utoipa::path(
    delete,
    path = "/planned-tasks/{id}",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    responses(
        (status = 204, description = "Tarefa planejada removida"),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn delete_planned_task(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;
    db.find_planned_task(&id)?
        .ok_or_else(|| ApiError::not_found(format!("Tarefa planejada '{id}' não encontrada")))?;
    db.delete_planned_task(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

// ================================================================
// POST /planned-tasks/:id/complete
// ================================================================

#[utoipa::path(
    post,
    path = "/planned-tasks/{id}/complete",
    tag = "planned-tasks",
    params(("id" = String, Path, description = "ID da tarefa planejada")),
    request_body(
        content = PlannedTaskCompleteRequest,
        description = "Data a marcar como concluída. Se omitida, usa hoje.",
        example = json!({ "date": "2026-04-18" })
    ),
    responses(
        (status = 200, description = "Tarefa marcada como concluída", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn post_planned_task_complete(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Json<PlannedTaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let req: Option<PlannedTaskCompleteRequest> = parse_optional_body(&body)?;
    let date = req
        .and_then(|r| r.date)
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let db = state.open_db()?;
    let found = db.complete_planned_task(&id, &date)?;
    if !found {
        return Err(ApiError::not_found(format!(
            "Tarefa planejada '{id}' não encontrada"
        )));
    }
    let updated = db
        .find_planned_task(&id)?
        .ok_or_else(|| ApiError::internal("Tarefa não encontrada após atualização"))?;
    Ok(Json(build_planned_task_dto(&db, &updated)?))
}

// ================================================================
// DELETE /planned-tasks/:id/complete/:date
// ================================================================

#[utoipa::path(
    delete,
    path = "/planned-tasks/{id}/complete/{date}",
    tag = "planned-tasks",
    params(
        ("id" = String, Path, description = "ID da tarefa planejada"),
        ("date" = String, Path, description = "Data a desmarcar (YYYY-MM-DD)")
    ),
    responses(
        (status = 200, description = "Conclusão removida", body = PlannedTaskDto),
        (status = 404, description = "Não encontrada", body = ErrorResponse)
    )
)]
pub async fn delete_planned_task_complete(
    State(state): State<Arc<ApiState>>,
    Path((id, date)): Path<(String, String)>,
) -> ApiResult<Json<PlannedTaskDto>> {
    let _guard = state.write_lock.lock().unwrap();
    let db = state.open_db()?;
    let found = db.uncomplete_planned_task(&id, &date)?;
    if !found {
        return Err(ApiError::not_found(format!(
            "Tarefa planejada '{id}' não encontrada"
        )));
    }
    let updated = db
        .find_planned_task(&id)?
        .ok_or_else(|| ApiError::internal("Tarefa não encontrada após atualização"))?;
    Ok(Json(build_planned_task_dto(&db, &updated)?))
}

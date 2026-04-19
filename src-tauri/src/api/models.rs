use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub id: String,
    pub name: Option<String>,
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    pub category_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_name: Option<String>,
    pub billable: bool,
    pub status: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub elapsed_seconds: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TodayTotals {
    pub total_seconds: i64,
    pub billable_seconds: i64,
    pub non_billable_seconds: i64,
    pub task_count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub running: bool,
    pub task: Option<TaskDto>,
    pub today: TodayTotals,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    pub billable: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StopTaskRequest {
    #[serde(default = "default_true")]
    pub completed: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ToggleTaskRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    #[serde(default = "default_true")]
    pub billable: bool,
}

impl Default for ToggleTaskRequest {
    fn default() -> Self {
        Self {
            name: None,
            project_id: None,
            project_name: None,
            category_id: None,
            category_name: None,
            billable: true,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDto {
    pub id: String,
    pub name: String,
    pub default_billable: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
}

// ================================================================
// PlannedTask models
// ================================================================

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct PlannedTaskActionDto {
    /// "open_url" or "open_file"
    #[serde(rename = "type")]
    pub action_type: String,
    pub value: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTaskDto {
    pub id: String,
    pub name: String,
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    pub category_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_name: Option<String>,
    pub billable: bool,
    pub schedule_type: String,
    pub schedule_date: Option<String>,
    pub recurring_days: Option<Vec<i64>>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub completed_dates: Vec<String>,
    pub actions: Vec<PlannedTaskActionDto>,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlannedTaskRequest {
    pub name: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    #[serde(default = "default_true")]
    pub billable: bool,
    pub schedule_type: String,
    #[serde(default)]
    pub schedule_date: Option<String>,
    #[serde(default)]
    pub recurring_days: Option<Vec<i64>>,
    #[serde(default)]
    pub period_start: Option<String>,
    #[serde(default)]
    pub period_end: Option<String>,
    #[serde(default)]
    pub actions: Vec<PlannedTaskActionDto>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlannedTaskRequest {
    pub name: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    pub billable: bool,
    pub schedule_type: String,
    #[serde(default)]
    pub schedule_date: Option<String>,
    #[serde(default)]
    pub recurring_days: Option<Vec<i64>>,
    #[serde(default)]
    pub period_start: Option<String>,
    #[serde(default)]
    pub period_end: Option<String>,
    #[serde(default)]
    pub actions: Vec<PlannedTaskActionDto>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTaskCompleteRequest {
    /// Data no formato YYYY-MM-DD. Se omitida, usa a data de hoje.
    pub date: Option<String>,
}

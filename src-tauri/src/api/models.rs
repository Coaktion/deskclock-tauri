//! DTOs da API local. Servem ao schema do Swagger e à validação do formato de
//! entrada — o conteúdo é decidido no TS, do outro lado da ponte.
//!
//! Os campos das requisições nunca são lidos pelo Rust: existem para o serde
//! recusar corpo malformado e para o utoipa descrever o schema. Daí o
//! `dead_code` liberado no módulo.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub id: String,
    pub workspace_id: String,
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
    pub planned_task_id: Option<String>,
    /// Valores dos campos personalizados, por id do campo.
    pub custom_values: HashMap<String, String>,
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
    /// Totais de hoje no workspace da requisição.
    pub today: TodayTotals,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskRequest {
    /// Workspace da tarefa. Ausente = workspace ativo.
    #[serde(default)]
    pub workspace_id: Option<String>,
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
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StopTaskRequest {
    /// Padrão: true. Só a tarefa concluída marca a planejada de origem e dispara o envio automático.
    #[serde(default)]
    pub completed: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ToggleTaskRequest {
    #[serde(default)]
    pub workspace_id: Option<String>,
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
    /// Padrão: true.
    #[serde(default)]
    pub billable: Option<bool>,
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDto {
    pub id: String,
    pub workspace_id: String,
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
    /// Rótulo exibido no chip. Ausente = derivado do valor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTaskDto {
    pub id: String,
    pub workspace_id: String,
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
    pub custom_values: HashMap<String, String>,
    /// Hora marcada de início, "HH:MM".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    /// Hora marcada de fim, "HH:MM".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlannedTaskRequest {
    /// Ausente = workspace ativo.
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    /// Padrão: true.
    #[serde(default)]
    pub billable: Option<bool>,
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
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
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
    /// Ausente = preservado.
    #[serde(default)]
    pub sort_order: Option<i64>,
    /// Ausente = preservado; `null` remove.
    #[serde(default)]
    pub start_time: Option<String>,
    /// Ausente = preservado; `null` remove.
    #[serde(default)]
    pub end_time: Option<String>,
    /// Ausente = preservado; `null` limpa.
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTaskCompleteRequest {
    /// Data no formato YYYY-MM-DD. Se omitida, usa a data de hoje.
    pub date: Option<String>,
}

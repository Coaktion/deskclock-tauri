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
    /// Slot da paleta de cores de projeto, atribuído na criação.
    pub color_index: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    /// Ausente = workspace ativo.
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategoryRequest {
    /// Ausente = workspace ativo.
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub name: String,
    /// Padrão: true.
    #[serde(default)]
    pub default_billable: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryRequest {
    pub name: String,
    /// Ausente = preservado.
    #[serde(default)]
    pub default_billable: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogRequest {
    /// Ausente = workspace ativo.
    #[serde(default)]
    pub workspace_id: Option<String>,
    /// Um nome por linha.
    pub text: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogResponse {
    pub created: i64,
    /// Linhas não importadas (nome repetido ou vazio).
    pub skipped: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteManyRequest {
    /// Ausente = workspace ativo.
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCategoryDto {
    pub category_id: String,
    /// "manual" ou "monday".
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetProjectCategoriesRequest {
    pub category_ids: Vec<String>,
}

// ================================================================
// Workspaces
// ================================================================

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    pub id: String,
    pub name: String,
    /// Slot da paleta (rose, orange, amber, lime, teal, cyan, violet, fuchsia).
    pub color: String,
    pub created_at: String,
    pub active: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub name: String,
    /// Ausente = derivada do nome.
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspaceRequest {
    pub name: String,
    /// Ausente = preservada.
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorkspaceRequest {
    /// "move" ou "delete".
    pub mode: String,
    /// Obrigatório com `mode: "move"`.
    #[serde(default)]
    pub to_workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveWorkspaceRequest {
    pub id: String,
}

// ================================================================
// Campos personalizados
// ================================================================

#[derive(Debug, Serialize, ToSchema)]
pub struct CustomFieldOptionDto {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldDto {
    pub id: String,
    pub label: String,
    /// "text", "multiline", "select" ou "checkbox".
    #[serde(rename = "type")]
    pub field_type: String,
    pub options: Vec<CustomFieldOptionDto>,
    pub sort_order: i64,
    pub archived: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomFieldRequest {
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(default)]
    pub option_labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomFieldRequest {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub option_labels: Option<Vec<String>>,
    #[serde(default)]
    pub archived: Option<bool>,
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

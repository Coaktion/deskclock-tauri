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
    /// Dia local do app, do mesmo instante dos totais de hoje.
    pub clock: LocalClock,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LocalClock {
    /// Data local, `AAAA-MM-DD`.
    #[schema(example = "2026-09-18")]
    pub date: String,
    /// Dia da semana em inglês.
    #[schema(example = "Friday")]
    pub weekday: String,
    /// Offset do fuso local em relação a UTC.
    #[schema(example = "-03:00")]
    pub utc_offset: String,
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
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
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
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
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
    /// Padrão: 0, como no app — as listas ordenam por `sortOrder` e depois pela criação.
    #[serde(default)]
    pub sort_order: Option<i64>,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
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
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito. Ausente = preservado; `null` limpa.
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

/// Edição parcial de uma planejada: campo ausente é preservado. `null` limpa
/// `projectId`/`projectName`, `categoryId`/`categoryName`, `startTime`, `endTime`,
/// `customValues` (vira `{}`) e `actions` (vira `[]`); em `name` e `scheduleType`
/// é recusado (400). Os `Option` simples bastam: o corpo vai à ponte como JSON
/// cru, e é o TS que distingue ausente de `null`.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PatchPlannedTaskRequest {
    /// Não aceita `null` nem texto vazio.
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
    /// Ausente ao trocar a categoria = `defaultBillable` da nova.
    #[serde(default)]
    pub billable: Option<bool>,
    /// "specific_date", "recurring" ou "period". Trocar o tipo exige os campos dele
    /// (`scheduleDate`; `recurringDays` não vazio; `periodStart` e `periodEnd`) e limpa os do anterior.
    #[serde(default)]
    pub schedule_type: Option<String>,
    /// YYYY-MM-DD, só em `specific_date`.
    #[serde(default)]
    pub schedule_date: Option<String>,
    /// 0=Dom..6=Sáb, só em `recurring`.
    #[serde(default)]
    pub recurring_days: Option<Vec<i64>>,
    /// YYYY-MM-DD, só em `period`.
    #[serde(default)]
    pub period_start: Option<String>,
    /// YYYY-MM-DD, só em `period`.
    #[serde(default)]
    pub period_end: Option<String>,
    /// Lista final de ações; `null` remove todas.
    #[serde(default)]
    pub actions: Option<Vec<PlannedTaskActionDto>>,
    #[serde(default)]
    pub sort_order: Option<i64>,
    /// "HH:MM"; `null` remove.
    #[serde(default)]
    pub start_time: Option<String>,
    /// "HH:MM"; `null` remove.
    #[serde(default)]
    pub end_time: Option<String>,
    /// Valores dos campos personalizados, por id do campo; o mapa enviado **substitui** o atual e `null` ou `{}` limpa. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTaskCompleteRequest {
    /// Data no formato YYYY-MM-DD. Se omitida, usa a data de hoje.
    pub date: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPlannedTaskRetroactiveRequest {
    /// Dia do lançamento, YYYY-MM-DD. Ausente = hoje; não pode ser futuro.
    #[serde(default)]
    pub date: Option<String>,
    /// Só para planejada sem horário (obrigatório nela): instante ISO 8601 no dia `date`.
    #[serde(default)]
    pub start_time: Option<String>,
    /// Só para planejada sem horário (obrigatório nela): instante ISO 8601; duração mínima de 1 minuto.
    #[serde(default)]
    pub end_time: Option<String>,
}

// ================================================================
// Histórico e totais
// ================================================================

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskRequest {
    /// Ausente = workspace ativo.
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
    /// Instante ISO 8601 com hora.
    pub start_time: String,
    /// Instante ISO 8601 com hora; ao menos 1 minuto depois do início.
    pub end_time: String,
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

/// Edição parcial: campo ausente é preservado; `null` limpa, exceto em `startTime`/`endTime` (400).
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskRequest {
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
    #[serde(default)]
    pub billable: Option<bool>,
    /// Instante ISO 8601. Início ou fim informado recalcula a duração.
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

/// Edição parcial da tarefa em execução ou pausada: ausente é preservado.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActiveTaskRequest {
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
    #[serde(default)]
    pub billable: Option<bool>,
    /// Instante ISO 8601, não futuro.
    #[serde(default)]
    pub start_time: Option<String>,
    /// Valores dos campos personalizados, por id do campo. Validados e normalizados como na UI: id de campo desconhecido, ou valor inválido, devolve 400 e nada é gravado. `select` aceita o id da opção ou o rótulo (sem diferenciar caixa); `checkbox` aceita `1`, `true` ou `Sim` para marcar e vazio, `false`, `0` ou `Não` para desmarcar (a chave deixa de existir); `text` e `multiline` têm as pontas aparadas. Valor vazio equivale a sem valor. Campo arquivado é aceito.
    #[serde(default)]
    pub custom_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct TaskIdsRequest {
    pub ids: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SetTaskBillableRequest {
    pub billable: bool,
}

/// O que fazer com o projeto ou a categoria no workspace de destino.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CatalogResolutionDto {
    /// Usa um item que já existe no destino.
    Match {
        #[serde(rename = "targetId")]
        target_id: String,
    },
    /// Cria (ou reaproveita, se já existir) um item com este nome no destino.
    Create { name: String },
    /// Deixa vazio.
    Unset,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveTasksRequest {
    pub ids: Vec<String>,
    pub to_workspace_id: String,
    pub project: CatalogResolutionDto,
    pub category: CatalogResolutionDto,
    pub mode: MoveMode,
}

/// `move` reatribui as tarefas; `copy` deixa as originais intactas.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum MoveMode {
    Move,
    Copy,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MoveTasksResponse {
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PeriodTotalsDto {
    pub from: String,
    pub to: String,
    pub total_seconds: i64,
    pub billable_seconds: i64,
    pub non_billable_seconds: i64,
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WeekTotalsDto {
    /// Primeiro dia da semana conforme `weekStartsOn`, YYYY-MM-DD.
    pub week_start: String,
    /// Último dia da semana conforme `weekStartsOn`, YYYY-MM-DD.
    pub week_end: String,
    pub total_seconds: i64,
    pub days_worked: i64,
}

// ---------------- Envio às integrações ----------------

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendTasksRequest {
    /// Ids de tarefas concluídas, da prévia. Cada id envia o grupo inteiro em que está.
    pub task_ids: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SendGroupState {
    /// Todas as tarefas do grupo já foram enviadas a esta integração.
    Sent,
    /// Pode ser enviado — é o que a tela pré-seleciona.
    Pending,
    /// Falta dado (`missing`); não pode ser enviado.
    Invalid,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendPreviewGroupDto {
    /// Chave de agrupamento (nome + projeto + categoria + valores personalizados).
    pub key: String,
    pub name: Option<String>,
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    pub category_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_name: Option<String>,
    pub total_seconds: i64,
    /// Todas as tarefas do grupo.
    pub task_ids: Vec<String>,
    /// As que já foram enviadas a esta integração.
    pub sent_task_ids: Vec<String>,
    pub state: SendGroupState,
    /// Campos faltando (pt-BR), só em `invalid`.
    pub missing: Vec<String>,
    /// Parte do grupo já enviada; só em `pending`.
    pub partially_sent: bool,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendPreviewDayDto {
    /// Dia local, YYYY-MM-DD.
    pub date: String,
    pub total_seconds: i64,
    pub groups: Vec<SendPreviewGroupDto>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendPreviewDto {
    pub integration: String,
    /// Workspace do DeskClock da integração (Configurações → Integrações).
    pub workspace_id: String,
    pub from: String,
    pub to: String,
    /// Do dia mais recente para o mais antigo.
    pub days: Vec<SendPreviewDayDto>,
    /// O que barraria o envio dos grupos pendentes (ex.: projeto sem board no Monday), ou nulo.
    pub send_warning: Option<String>,
    /// O aviso da tela para reenvio do que já foi enviado. O reenvio é permitido.
    pub resend_warning: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendTasksResponse {
    /// Ids marcados como enviados (já expandidos para o grupo).
    pub sent_task_ids: Vec<String>,
    /// Subconjunto de `sentTaskIds` que já estava igual no destino (só o Monday informa).
    pub skipped_task_ids: Vec<String>,
    /// Recusas do destino: o usuário precisa mudar algo na tarefa.
    pub refused: Vec<String>,
    /// Falhas técnicas: tentar de novo.
    pub failed: Vec<String>,
    /// Grupos confirmados por inteiro.
    pub sent_groups: i64,
    /// A frase que a tela mostraria.
    pub message: String,
}

// ---------------- Exportação ----------------

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportColumnDto {
    /// `name`, `project`, `category`, `billable`, `startTime`, `endTime`, `durationSeconds`
    /// ou `custom:<id do campo personalizado>`.
    pub field: String,
    /// Cabeçalho da coluna (CSV) ou chave do objeto (JSON).
    pub label: String,
    pub visible: bool,
    /// Posição; a saída segue a ordem crescente.
    pub order: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportProfileDto {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    /// No máximo um padrão por workspace.
    pub is_default: bool,
    /// `csv` ou `json`.
    pub format: String,
    /// `comma` ou `semicolon` (só vale no CSV).
    pub separator: String,
    /// `hh:mm:ss`, `decimal` (horas) ou `minutes`.
    pub duration_format: String,
    /// `iso` (AAAA-MM-DD) ou `dd/mm/yyyy`.
    pub date_format: String,
    pub columns: Vec<ExportColumnDto>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateExportProfileRequest {
    pub name: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub is_default: Option<bool>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub separator: Option<String>,
    #[serde(default)]
    pub duration_format: Option<String>,
    #[serde(default)]
    pub date_format: Option<String>,
    #[serde(default)]
    pub columns: Option<Vec<ExportColumnDto>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExportProfileRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub is_default: Option<bool>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub separator: Option<String>,
    #[serde(default)]
    pub duration_format: Option<String>,
    #[serde(default)]
    pub date_format: Option<String>,
    #[serde(default)]
    pub columns: Option<Vec<ExportColumnDto>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExportRequest {
    /// Ausente = o perfil padrão do workspace (sem padrão, o primeiro).
    #[serde(default)]
    pub profile_id: Option<String>,
    /// Primeiro dia local, YYYY-MM-DD. Ausente = hoje.
    #[serde(default)]
    pub from: Option<String>,
    /// Último dia local, YYYY-MM-DD. Ausente = o mesmo de `from`.
    #[serde(default)]
    pub to: Option<String>,
    /// Exporta só estas tarefas concluídas do período. Ausente = todas.
    #[serde(default)]
    pub task_ids: Option<Vec<String>>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskExportDto {
    /// O texto CSV ou JSON, como o botão Copiar do modal o copia.
    pub content: String,
    /// Nome sugerido: `export.csv` ou `export.json`.
    pub file_name: String,
    pub format: String,
    /// `text/csv` ou `application/json`.
    pub mime_type: String,
    /// Registros gerados, já com as tarefas agrupadas somadas.
    pub row_count: i64,
    pub profile_id: String,
    pub workspace_id: String,
    pub from: String,
    pub to: String,
}

// ---------------- Imports das integrações ----------------

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportEventDto {
    /// Id do evento no Google; é o que o import recebe.
    pub id: String,
    pub title: String,
    /// Dia local, YYYY-MM-DD.
    pub date: String,
    /// "HH:MM"; nulo em evento de dia inteiro.
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    /// Ocorrência de uma série do Google.
    pub recurring: bool,
    /// Videoconferência, senão o próprio evento — o que a ação de abrir URL abre.
    pub link: Option<String>,
    /// Sugestão (metadados "Projeto:"/"Categoria:" da descrição); é o que vai sem edição.
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    /// `recurring` para ocorrência de série, senão `specific_date`.
    pub schedule_type: String,
    /// Dias sugeridos (0 = domingo); sem sábado e domingo com o fim de semana desligado.
    pub recurring_days: Vec<i64>,
    /// Já há planejada de mesmo nome no workspace de destino, no período.
    pub already_exists: bool,
    /// Casa com uma regra de "Eventos ignorados".
    pub ignored: bool,
    /// Vem marcado na tela: nem `alreadyExists` nem `ignored`.
    pub preselected: bool,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportPreviewDto {
    pub integration: String,
    /// Workspace de destino (Configurações → Integrações → Google Agenda).
    pub workspace_id: String,
    pub from: String,
    pub to: String,
    pub events: Vec<CalendarImportEventDto>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportEventRequest {
    /// Id do evento, da prévia.
    pub id: String,
    /// Sobrescreve a sugestão; `null` deixa sem projeto. Trocar o projeto sem mandar a
    /// categoria a limpa, como a tela.
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    /// `specific_date` ou `recurring`.
    #[serde(default)]
    pub schedule_type: Option<String>,
    /// Dias da recorrência, 0 (domingo) a 6.
    #[serde(default)]
    pub recurring_days: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportRequest {
    /// O mesmo período da prévia. Ausentes = a semana corrente.
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    pub events: Vec<CalendarImportEventRequest>,
    /// Ação de abrir o link do evento. Ausente = `true`, como a tela.
    #[serde(default)]
    pub add_open_url_action: Option<bool>,
    /// Rastrear as reuniões (avisar no início e no fim). Ausente = `false`, como a tela.
    #[serde(default)]
    pub track_meetings: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportedEventDto {
    pub event_id: String,
    pub planned_task: PlannedTaskDto,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportResponse {
    pub workspace_id: String,
    pub created: Vec<CalendarImportedEventDto>,
    /// Recorrentes de mesmo nome e horário absorvidas por outro evento do lote.
    pub merged_event_ids: Vec<String>,
    pub tracked_meetings: i64,
    /// Falhas do rastreamento; as planejadas foram gravadas mesmo assim.
    pub track_errors: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ZendeskTicketPreviewDto {
    pub id: i64,
    pub subject: String,
    /// `new`, `open`, `pending` ou `hold`.
    pub status: String,
    pub web_url: String,
    /// O que a linha abre: nome `#id - assunto`, recorrente, data de hoje, ação ligada.
    pub name: String,
    pub schedule_type: String,
    pub schedule_date: String,
    pub add_open_url_action: bool,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ZendeskImportPreviewDto {
    pub integration: String,
    pub workspace_id: String,
    /// Atribuídos a você, em aberto.
    pub tickets: Vec<ZendeskTicketPreviewDto>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ZendeskImportTicketRequest {
    pub id: i64,
    /// Ausente ou em branco = `#id - assunto`.
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
    /// Ausente = `true`.
    #[serde(default)]
    pub add_open_url_action: Option<bool>,
    /// `recurring` (todos os dias; padrão) ou `specific_date`.
    #[serde(default)]
    pub schedule_type: Option<String>,
    /// YYYY-MM-DD, só em `specific_date`. Ausente = hoje.
    #[serde(default)]
    pub schedule_date: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ZendeskImportRequest {
    pub tickets: Vec<ZendeskImportTicketRequest>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ZendeskImportResponse {
    pub workspace_id: String,
    pub imported: i64,
    pub ticket_ids: Vec<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayItemPeriodDto {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayImportItemDto {
    /// Id do item no Monday; é o que o import recebe.
    pub id: String,
    pub name: String,
    pub board_id: String,
    pub url: String,
    /// Projeto do DeskClock vinculado ao board.
    pub project_id: String,
    pub project_name: String,
    /// Timeline do item; nulo = sem cronograma (nasce hoje).
    pub period: Option<MondayItemPeriodDto>,
    pub activity_type: Option<String>,
    pub project_stage: Option<String>,
    /// Sugestão pela Activity Type, com o billable acompanhando a categoria.
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub billable: bool,
    /// Etapa sugerida pela coluna Project Stage, no campo de `stageField`.
    pub custom_values: HashMap<String, String>,
    /// Já tem planejada viva: o import recusa.
    pub already_imported: bool,
    /// Já há planejada de mesmo nome (o chip "já existe"); o import aceita.
    pub already_exists: bool,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayStageFieldDto {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayImportPreviewDto {
    pub integration: String,
    pub workspace_id: String,
    /// `today`, `week` ou `next30`.
    pub period: String,
    pub from: String,
    pub to: String,
    /// Boards vinculados com projeto no workspace da integração.
    pub boards: i64,
    /// Boards vinculados a projetos de outro workspace, fora da lista.
    pub unavailable_boards: i64,
    /// Campo personalizado da etapa; nulo enquanto não configurado.
    pub stage_field: Option<MondayStageFieldDto>,
    pub items: Vec<MondayImportItemDto>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayImportItemRequest {
    pub id: String,
    /// Sobrescreve a sugestão; o billable passa a ser o padrão da categoria. `null` limpa.
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    /// Rótulo (ou id) de uma opção do campo de etapa; vazio limpa.
    #[serde(default)]
    pub project_stage: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayImportRequest {
    pub items: Vec<MondayImportItemRequest>,
    /// Ação de abrir o item no Monday. Ausente = `true`, como a tela.
    #[serde(default)]
    pub add_open_url_action: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayImportedItemDto {
    pub item_id: String,
    pub planned_task: PlannedTaskDto,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayImportResponse {
    pub workspace_id: String,
    pub created: Vec<MondayImportedItemDto>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondaySkippedBoardDto {
    pub portfolio_item_id: String,
    pub board_name: String,
    pub reason: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondaySeededCategoriesDto {
    /// Associações projeto ↔ categoria gravadas.
    pub seeded: i64,
    pub projects: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayProjectsImportResponse {
    pub workspace_id: String,
    /// Projetos vinculados ao Portfólio.
    pub projects: i64,
    /// Deles, sem "ID Quadro Projeto": as horas não sobem.
    pub without_board: i64,
    /// Boards fora do template, com o motivo; o projeto existe mesmo assim.
    pub skipped: Vec<MondaySkippedBoardDto>,
    /// Itens do Portfólio sem "Oferta", que não viram projeto.
    pub ignored: i64,
    pub seeded_categories: MondaySeededCategoriesDto,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayCategoriesImportResponse {
    pub workspace_id: String,
    pub created: Vec<String>,
    /// Já existiam; não são alteradas.
    pub existing: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MondayFieldCatalogsDto {
    pub activity_type: Vec<String>,
    pub project_stage: Vec<String>,
    pub non_billable_reason: Vec<String>,
    pub report_type: Vec<String>,
}

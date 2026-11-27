//! Tools do MCP. Cada uma só mapeia nome → `op` + params e chama a ponte direto:
//! a regra fica no TS, como na API REST (`docs-internal/specs/mcp.md` §2).

use crate::api::bridge::Bridge;
// Glob de propósito: `ops` só exporta os nomes das tools, as `op` e `ops_of`.
use crate::mcp::ops::*;
use crate::mcp::result::{body_or_error, success};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Implementation, ServerCapabilities, ServerConfig},
    schemars, tool, tool_handler, tool_router, ServerHandler,
};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArgs {
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    pub workspace_id: Option<String>,
}

impl WorkspaceArgs {
    fn params(&self) -> Value {
        json!({ "workspaceId": self.workspace_id })
    }
}

// Projeto, categoria, faturamento e workspace de uma tarefa nova: os mesmos
// campos nas três tools que criam tarefa (iniciar, planejar, lançar retroativo).
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskFields {
    /// Project id (from list_catalog). Takes precedence over projectName.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Exact project name, as listed by list_catalog. Ignored when projectId is given.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    /// Category id (from list_catalog). Takes precedence over categoryName.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    /// Exact category name, as listed by list_catalog. Ignored when categoryId is given.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_name: Option<String>,
    /// Whether the time is billable. Not inferred from the category: when the user
    /// does not say, use the category's `defaultBillable` from list_catalog.
    pub billable: bool,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// Custom field values: keys are custom field ids from list_custom_fields; values
    /// are plain strings — the text for text/multiline, an option label (or id) for
    /// select, "true" or "Sim" to check a checkbox. Omit fields without a value. Call
    /// list_custom_fields first.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_values: Option<HashMap<String, String>>,
}

// Os corpos vão ao TS como o cliente mandou, como no repasse da REST: campo
// omitido fica ausente, e o TS trata ausente e `null` do mesmo jeito.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskArgs {
    /// Task name (free text). Optional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(flatten)]
    pub task: TaskFields,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StopTaskArgs {
    /// Whether the work was finished. Default true. Only a completed task marks its
    /// planned task as done for today and is sent to the integrations the user set
    /// to send automatically per task, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PlannedTaskIdArgs {
    /// Planned task id, from list_planned_tasks.
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListPlannedTasksArgs {
    /// A single day, YYYY-MM-DD: the planned tasks scheduled for that day. Do not
    /// combine with from/to.
    pub date: Option<String>,
    /// First day of a range, YYYY-MM-DD. Alone, it means that single day.
    pub from: Option<String>,
    /// Last day of a range, YYYY-MM-DD (inclusive). Alone, it means that single day.
    pub to: Option<String>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    pub workspace_id: Option<String>,
}

impl ListPlannedTasksArgs {
    /// As chaves do `GET /planned-tasks`: as quatro sempre presentes, nulas quando omitidas.
    fn params(&self) -> Value {
        json!({
            "date": self.date,
            "from": self.from,
            "to": self.to,
            "workspaceId": self.workspace_id,
        })
    }
}

// Inline em vez de `$ref` para `$defs`: nem todo cliente MCP resolve referência
// no esquema de entrada, e o enum é o que diz ao modelo os valores válidos.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum ScheduleType {
    SpecificDate,
    Recurring,
    Period,
}

// Inline pelo mesmo motivo do `ScheduleType`.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum PlannedTaskActionType {
    OpenUrl,
    OpenFile,
}

/// Como o `PlannedTaskActionDto` da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub struct PlannedTaskAction {
    /// `open_url` (a web address) or `open_file` (a file or folder path on the user's
    /// machine).
    #[serde(rename = "type")]
    #[schemars(rename = "type")]
    pub action_type: PlannedTaskActionType,
    /// The URL or the path.
    pub value: String,
    /// Label shown on the chip. Omit to derive it from the value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlanTaskArgs {
    /// Task name.
    pub name: String,
    #[serde(flatten)]
    pub task: TaskFields,
    /// How the task is scheduled: `specific_date` (one day, set scheduleDate),
    /// `recurring` (weekly, set recurringDays) or `period` (every day from
    /// periodStart to periodEnd).
    pub schedule_type: ScheduleType,
    /// The day, YYYY-MM-DD. Required with scheduleType `specific_date`; omit otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_date: Option<String>,
    /// Weekdays it repeats on, 0 = Sunday … 6 = Saturday. Required with scheduleType
    /// `recurring`; omit otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurring_days: Option<Vec<u8>>,
    /// First day, YYYY-MM-DD. Required with scheduleType `period`; omit otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period_start: Option<String>,
    /// Last day (inclusive), YYYY-MM-DD, with scheduleType `period`. Omit for a
    /// period with no end.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period_end: Option<String>,
    /// Scheduled start time of day, HH:MM (24h, local). Only for an appointment at a
    /// fixed time; send it together with endTime, or neither.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    /// Scheduled end time of day, HH:MM (24h, local). An end earlier than or equal
    /// to the start means it ends the next day.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    /// Quick actions shown on the planned task's card: links or files the user opens
    /// from it. Omit for none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<PlannedTaskAction>>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPastTaskArgs {
    /// Task name (free text). Optional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(flatten)]
    pub task: TaskFields,
    /// When the work started: an ISO 8601 datetime with the user's UTC offset from
    /// get_status, e.g. 2026-09-15T14:00:00-03:00. Without an offset it is read as
    /// the user's local time; a date alone is an error.
    pub start_time: String,
    /// When the work ended, same format as startTime; at least 1 minute after it.
    pub end_time: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPlannedTaskArgs {
    /// Planned task id, from list_planned_tasks.
    pub id: String,
    #[serde(flatten)]
    pub body: LogPlannedTaskBody,
}

/// O corpo do lançamento; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPlannedTaskBody {
    /// The day the work was done, YYYY-MM-DD. Omit for today; cannot be in the
    /// future. When retrying, send it explicitly: a retry without it after midnight
    /// would target the next day.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    /// Only for a planned task that does not have both `startTime` and `endTime`
    /// in list_planned_tasks, and then required: when the work started, an ISO 8601
    /// datetime on `date` with the user's UTC offset, e.g. 2026-09-15T14:00:00-03:00.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    /// Only for a planned task that does not have both `startTime` and `endTime`,
    /// and then required: when the work ended, same format; at least 1 minute after
    /// startTime.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListTasksArgs {
    /// First day, YYYY-MM-DD, in the user's local time. Omit for today.
    pub from: Option<String>,
    /// Last day (inclusive), YYYY-MM-DD. Omit for the same day as `from`.
    pub to: Option<String>,
    /// Only tasks whose name contains this text (case-insensitive).
    pub name: Option<String>,
    /// Only tasks of this project id (from list_catalog). Ids only, not names.
    pub project_id: Option<String>,
    /// Only tasks of this category id (from list_catalog). Ids only, not names.
    pub category_id: Option<String>,
    /// Only billable (true) or only non-billable (false) tasks. Omit for both.
    pub billable: Option<bool>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    pub workspace_id: Option<String>,
}

impl ListTasksArgs {
    /// As chaves do `GET /tasks`: todas presentes, nulas quando omitidas, e
    /// `billable` em texto, como a query string chega ao TS.
    fn params(&self) -> Value {
        json!({
            "from": self.from,
            "to": self.to,
            "name": self.name,
            "projectId": self.project_id,
            "categoryId": self.category_id,
            "billable": self.billable.map(|b| b.to_string()),
            "workspaceId": self.workspace_id,
        })
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetTotalsArgs {
    /// First day, YYYY-MM-DD, in the user's local time. Omit for today.
    pub from: Option<String>,
    /// Last day (inclusive), YYYY-MM-DD. Omit for the same day as `from`.
    pub to: Option<String>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    pub workspace_id: Option<String>,
}

impl GetTotalsArgs {
    fn params(&self) -> Value {
        json!({ "from": self.from, "to": self.to, "workspaceId": self.workspace_id })
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetWeekTotalsArgs {
    /// Any day of the wanted week, YYYY-MM-DD. Omit for the current week.
    pub date: Option<String>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    pub workspace_id: Option<String>,
}

impl GetWeekTotalsArgs {
    fn params(&self) -> Value {
        json!({ "date": self.date, "workspaceId": self.workspace_id })
    }
}

// Inline pelo mesmo motivo do `ScheduleType`.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum CustomFieldType {
    Text,
    Multiline,
    Select,
    Checkbox,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomFieldArgs {
    /// Field label, unique among custom fields (an existing one is an error).
    pub label: String,
    /// `text` (one line), `multiline`, `select` (one option of a list) or `checkbox`.
    /// It cannot be changed later.
    #[serde(rename = "type")]
    #[schemars(rename = "type")]
    pub field_type: CustomFieldType,
    /// Option labels, in display order. Required (at least one) for `select`; omit
    /// for the other types.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub option_labels: Option<Vec<String>>,
}

/// Campo de edição parcial: `None` = ausente (o TS preserva), `Some(None)` = `null`
/// explícito (o TS limpa, ou recusa onde limpar não vale). O serde, sozinho, lê
/// `null` como ausente num `Option<Option<T>>`; o `present` mantém os dois.
pub type Patch<T> = Option<Option<T>>;

fn present<'de, D, T>(deserializer: D) -> Result<Patch<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

// Projeto, categoria, faturamento e valores personalizados de uma edição: os
// mesmos campos nas três tools de edição. Cada um vai ao TS como veio — ausente,
// `null` ou valor —, como no repasse do corpo da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EditFields {
    /// New project id (from list_catalog); takes precedence over projectName.
    /// null removes the project. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub project_id: Patch<String>,
    /// New project by exact name (see list_catalog), in the task's own workspace.
    /// null removes the project. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub project_name: Patch<String>,
    /// New category id (from list_catalog); takes precedence over categoryName.
    /// null removes the category. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub category_id: Patch<String>,
    /// New category by exact name (see list_catalog), in the task's own workspace.
    /// null removes the category. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub category_name: Patch<String>,
    /// New billable value. Omit to keep it — except that changing the category
    /// without sending billable applies the new category's `defaultBillable`, as
    /// the app does; a billable sent always wins. null counts as omitted.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<bool>")]
    pub billable: Patch<bool>,
    /// The complete map of custom field values, REPLACING the current one: to change
    /// one field, read the current `customValues` and send the whole map back. `{}`
    /// or null clears every value; omit to keep them. Keys are field ids from
    /// list_custom_fields; values are plain strings (text, an option label or id for
    /// select, "true"/"Sim" for a checkbox). An unknown field id or an invalid value
    /// is an error.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<HashMap<String, String>>")]
    pub custom_values: Patch<HashMap<String, String>>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRunningTaskArgs {
    /// New task name. null or an empty string removes it. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub name: Patch<String>,
    #[serde(flatten)]
    pub fields: EditFields,
    /// Corrected start instant: an ISO 8601 datetime with the user's UTC offset from
    /// get_status (e.g. 2026-09-15T14:00:00-03:00); without an offset it is read as
    /// the user's local time. Not in the future. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub start_time: Patch<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskArgs {
    /// Finished task id, from list_tasks.
    pub id: String,
    #[serde(flatten)]
    pub body: UpdateTaskBody,
}

/// O corpo da edição; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskBody {
    /// New task name. null or an empty string removes it. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub name: Patch<String>,
    #[serde(flatten)]
    pub fields: EditFields,
    /// New start: an ISO 8601 datetime with the user's UTC offset from get_status
    /// (e.g. 2026-09-15T14:00:00-03:00); without an offset it is read as the user's
    /// local time. Cannot be null. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub start_time: Patch<String>,
    /// New end, same format as startTime; not before the start. Cannot be null. Omit
    /// to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub end_time: Patch<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlannedTaskArgs {
    /// Planned task id, from list_planned_tasks.
    pub id: String,
    #[serde(flatten)]
    pub body: UpdatePlannedTaskBody,
}

/// O corpo do `PATCH`; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlannedTaskBody {
    /// New name; cannot be empty or null. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub name: Patch<String>,
    #[serde(flatten)]
    pub fields: EditFields,
    /// New schedule type: `specific_date`, `recurring` or `period`; cannot be null.
    /// Changing it requires the new type's fields in the same call (scheduleDate;
    /// recurringDays; periodStart, with periodEnd optional) and clears the old type's.
    /// Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<ScheduleType>")]
    pub schedule_type: Patch<ScheduleType>,
    /// The day, YYYY-MM-DD; only for `specific_date`. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub schedule_date: Patch<String>,
    /// Weekdays, 0 = Sunday … 6 = Saturday, not empty; only for `recurring`. Omit to
    /// keep them.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<Vec<u8>>")]
    pub recurring_days: Patch<Vec<u8>>,
    /// First day, YYYY-MM-DD; only for `period`. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub period_start: Patch<String>,
    /// Last day (inclusive), YYYY-MM-DD; only for `period`. null makes the period
    /// open-ended. Omit to keep it (or, when changing to `period`, to leave it open).
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub period_end: Patch<String>,
    /// Scheduled start time of day, HH:MM (24h, local). null removes the fixed
    /// time. Omit to keep it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub start_time: Patch<String>,
    /// Scheduled end time of day, HH:MM (24h, local). null removes it. Omit to keep
    /// it.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub end_time: Patch<String>,
    /// The final list of quick actions (links or files opened from the card),
    /// REPLACING the current one. `[]` or null removes all. Omit to keep them.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<Vec<PlannedTaskAction>>")]
    pub actions: Patch<Vec<PlannedTaskAction>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompletePlannedTaskArgs {
    /// Planned task id, from list_planned_tasks.
    pub id: String,
    #[serde(flatten)]
    pub body: CompletePlannedTaskBody,
}

/// O corpo da conclusão; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct CompletePlannedTaskBody {
    /// The day to mark as done, YYYY-MM-DD. Omit for today. When retrying, send it
    /// explicitly: a retry without it after midnight would target the next day.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UncompletePlannedTaskArgs {
    /// Planned task id, from list_planned_tasks.
    pub id: String,
    /// The day to unmark, YYYY-MM-DD (one of its `completedDates`).
    pub date: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomFieldArgs {
    /// Custom field id, from list_custom_fields.
    pub id: String,
    #[serde(flatten)]
    pub body: UpdateCustomFieldBody,
}

/// O corpo da edição; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomFieldBody {
    /// New label. Omit to keep it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// The final list of option labels of a `select` field, in the desired order
    /// (at least one). An existing option is matched by its label and keeps its id,
    /// and so the values already saved in tasks; an option left out of the list is
    /// removed, and a new label becomes a new option. Omit to keep the options.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub option_labels: Option<Vec<String>>,
    /// true archives the field (hidden from new entries, values kept), false
    /// restores it. Omit to keep it as is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteCustomFieldArgs {
    /// Custom field id, from list_custom_fields.
    pub id: String,
}

// ---------------- Fase B: Histórico ----------------
//
// Nenhuma `op` desta fase distingue ausente de `null` (o TS faz `??` em todo
// opcional), então os opcionais são `Option<T>` simples, não `Patch<T>`.

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TaskIdArgs {
    /// Finished task id, from list_tasks.
    pub id: String,
}

// Inline pelo mesmo motivo do `ScheduleType`. Os valores são as chaves do log de
// envio que o TS valida (`TASK_SEND_INTEGRATIONS`); fora delas o rmcp recusa antes.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum SendIntegration {
    GoogleSheets,
    Clockify,
    Monday,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PreviewSendArgs {
    /// Destination: `google_sheets`, `clockify` or `monday`.
    pub integration: SendIntegration,
    /// First local day, YYYY-MM-DD. Omit for today.
    pub from: Option<String>,
    /// Last local day (inclusive), YYYY-MM-DD. Omit for the same day as `from`.
    pub to: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendTasksArgs {
    /// Destination: `google_sheets`, `clockify` or `monday`.
    #[serde(skip_serializing)]
    pub integration: SendIntegration,
    /// Task ids from the `taskIds` of groups in preview_send_to_integration. Any id
    /// of a group sends the whole group. Not empty.
    pub task_ids: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct TaskIdsArgs {
    /// Finished task ids, from list_tasks. Not empty.
    pub ids: Vec<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetTaskBillableArgs {
    /// Finished task id, from list_tasks.
    pub id: String,
    #[serde(flatten)]
    pub body: SetTaskBillableBody,
}

/// O corpo; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct SetTaskBillableBody {
    /// The new billable value, for the task and its whole group.
    pub billable: bool,
}

// Inline pelo mesmo motivo do `ScheduleType`.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum MoveMode {
    Move,
    Copy,
}

// Inline pelo mesmo motivo do `ScheduleType`.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum CatalogResolutionKind {
    Match,
    Create,
    Unset,
}

/// O `CatalogResolution` da REST como struct, não como enum com tag: o esquema
/// sai plano (sem `oneOf`), e o casamento `kind` ↔ campo é checado no TS.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(inline)]
pub struct CatalogResolution {
    /// `match` uses an item that already exists in the destination workspace (set
    /// targetId); `create` creates one there with `name`, or reuses the one that
    /// already has that name; `unset` leaves it empty.
    pub kind: CatalogResolutionKind,
    /// With `match` only: the id of a project or category of the destination
    /// workspace (list_catalog with that workspaceId).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    /// With `create` only: the name to create in the destination workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveTasksArgs {
    /// Finished task ids, from list_tasks. Not empty; none of them may already be in
    /// the destination workspace.
    pub ids: Vec<String>,
    /// Destination workspace id, from list_catalog.
    pub to_workspace_id: String,
    /// What the tasks' project becomes in the destination (project ids do not cross
    /// workspaces).
    pub project: CatalogResolution,
    /// What the tasks' category becomes in the destination (category ids do not
    /// cross workspaces).
    pub category: CatalogResolution,
    /// `move` reassigns the tasks to the destination; `copy` creates copies there
    /// and leaves the originals as they are.
    pub mode: MoveMode,
}

// ---------------- Fase B: Projetos e categorias ----------------

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectArgs {
    /// Project name, unique in the workspace (an existing one is an error).
    pub name: String,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

/// Como o `scoped_params` da REST: `workspaceId` sempre presente, nulo quando omitido.
fn scoped_id_params(id: &str, workspace_id: &Option<String>) -> Value {
    json!({ "id": id, "workspaceId": workspace_id })
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIdArgs {
    /// Project id, from list_catalog.
    pub id: String,
    /// The project's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
}

impl ProjectIdArgs {
    fn params(&self) -> Value {
        scoped_id_params(&self.id, &self.workspace_id)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectArgs {
    /// Project id, from list_catalog.
    pub id: String,
    /// The project's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
    #[serde(flatten)]
    pub body: UpdateProjectBody,
}

/// O corpo; `id` e `workspaceId` vão fora dele, como no path e na query da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectBody {
    /// The new name, unique in the workspace.
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogArgs {
    /// One name per line; blank lines are ignored.
    pub text: String,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteManyArgs {
    /// Ids from list_catalog, all of the same workspace.
    pub ids: Vec<String>,
    /// Their workspace id (from list_catalog). Omit for the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategoryArgs {
    /// Category name, unique in the workspace (an existing one is an error).
    pub name: String,
    /// The billable value a task gets by default in this category. Default true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_billable: Option<bool>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CategoryIdArgs {
    /// Category id, from list_catalog.
    pub id: String,
    /// The category's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
}

impl CategoryIdArgs {
    fn params(&self) -> Value {
        scoped_id_params(&self.id, &self.workspace_id)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryArgs {
    /// Category id, from list_catalog.
    pub id: String,
    /// The category's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
    #[serde(flatten)]
    pub body: UpdateCategoryBody,
}

/// O corpo; `id` e `workspaceId` vão fora dele, como no path e na query da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryBody {
    /// The name, unique in the workspace. Required: send the current one to keep it.
    pub name: String,
    /// New default billable value. Omit to keep it. Tasks already recorded are not
    /// changed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_billable: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetProjectCategoriesArgs {
    /// Project id, from list_catalog.
    pub id: String,
    /// The project's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
    #[serde(flatten)]
    pub body: SetProjectCategoriesBody,
}

/// O corpo; `id` e `workspaceId` vão fora dele, como no path e na query da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetProjectCategoriesBody {
    /// The final list of category ids (from list_catalog, of the project's
    /// workspace), REPLACING the current selection. `[]` removes the filter.
    pub category_ids: Vec<String>,
}

// ---------------- Fase B: Workspaces ----------------

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct CreateWorkspaceArgs {
    /// Workspace name, unique (an existing one is an error).
    pub name: String,
    /// A palette slot: rose, orange, amber, lime, teal, cyan, violet or fuchsia.
    /// Omit to derive it from the name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateWorkspaceArgs {
    /// Workspace id, from list_catalog.
    pub id: String,
    #[serde(flatten)]
    pub body: UpdateWorkspaceBody,
}

/// O corpo; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct UpdateWorkspaceBody {
    /// The name, unique. Required: send the current one to keep it.
    pub name: String,
    /// A palette slot: rose, orange, amber, lime, teal, cyan, violet or fuchsia.
    /// Omit to keep the current color.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

// Inline pelo mesmo motivo do `ScheduleType`.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum WorkspaceDeletionMode {
    Move,
    Delete,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteWorkspaceArgs {
    /// Workspace id, from list_catalog.
    pub id: String,
    #[serde(flatten)]
    pub body: DeleteWorkspaceBody,
}

/// O corpo; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorkspaceBody {
    /// What happens to the workspace's data (tasks, planned tasks, projects,
    /// categories, export profiles): `move` reassigns all of it to toWorkspaceId;
    /// `delete` erases all of it.
    pub mode: WorkspaceDeletionMode,
    /// With `move` only, and then required: the workspace that receives the data,
    /// from list_catalog; not the one being deleted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct SetActiveWorkspaceArgs {
    /// Workspace id, from list_catalog.
    pub id: String,
}

// ---------------- Fase C2: Exportação ----------------
//
// Enums inline pelo mesmo motivo do `ScheduleType`; valor fora deles é recusado
// pelo rmcp antes da ponte. Os valores são os do `ExportProfile` do TS.

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum ExportFormatArg {
    Csv,
    Json,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum CsvSeparatorArg {
    Comma,
    Semicolon,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub enum DurationFormatArg {
    #[serde(rename = "hh:mm:ss")]
    HhMmSs,
    #[serde(rename = "decimal")]
    Decimal,
    #[serde(rename = "minutes")]
    Minutes,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub enum DateFormatArg {
    #[serde(rename = "iso")]
    Iso,
    #[serde(rename = "dd/mm/yyyy")]
    DdMmYyyy,
}

/// Uma coluna do perfil, inline para o esquema sair plano.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub struct ExportColumnArg {
    /// `name`, `project`, `category`, `billable`, `startTime`, `endTime`,
    /// `durationSeconds`, or `custom:<custom field id>` (ids from list_custom_fields).
    /// Each field at most once.
    pub field: String,
    /// The column header (CSV) or object key (JSON).
    pub label: String,
    /// Whether the column appears in the output.
    pub visible: bool,
    /// Position; the output follows ascending order.
    pub order: i64,
}

/// Formato e colunas de um perfil: os mesmos campos na criação e na edição.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportProfileFields {
    /// true makes it the workspace's default profile (the previous default stops
    /// being one); false on the default leaves the workspace without a default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    /// `csv` or `json`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<ExportFormatArg>,
    /// CSV separator: `comma` or `semicolon`. Ignored by JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub separator: Option<CsvSeparatorArg>,
    /// Duration: `hh:mm:ss`, `decimal` (hours, two decimals) or `minutes`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_format: Option<DurationFormatArg>,
    /// Dates: `iso` (YYYY-MM-DD) or `dd/mm/yyyy`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_format: Option<DateFormatArg>,
    /// The final list of columns. Active custom fields left out are added as
    /// invisible columns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub columns: Option<Vec<ExportColumnArg>>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateExportProfileArgs {
    /// Profile name (not empty; names may repeat).
    pub name: String,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(flatten)]
    pub fields: ExportProfileFields,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportProfileIdArgs {
    /// Export profile id, from list_export_profiles.
    pub id: String,
    /// The profile's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
}

impl ExportProfileIdArgs {
    fn params(&self) -> Value {
        scoped_id_params(&self.id, &self.workspace_id)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExportProfileArgs {
    /// Export profile id, from list_export_profiles.
    pub id: String,
    /// The profile's workspace id (from list_catalog). Omit for the active workspace.
    pub workspace_id: Option<String>,
    #[serde(flatten)]
    pub body: UpdateExportProfileBody,
}

/// O corpo; `id` e `workspaceId` vão fora dele, como no path e na query da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExportProfileBody {
    /// New name (not empty). Omit to keep it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(flatten)]
    pub fields: ExportProfileFields,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportTasksArgs {
    /// Export profile id, from list_export_profiles. Omit to use the workspace's
    /// default profile (or its first one when none is default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    /// First local day, YYYY-MM-DD. Omit for today.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// Last local day (inclusive), YYYY-MM-DD. Omit for the same day as `from`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// Export only these finished tasks (ids from list_tasks for the same period and
    /// workspace). Omit to export all of them. Not empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_ids: Option<Vec<String>>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Clone)]
pub struct DeskClockMcp {
    bridge: Arc<Bridge>,
    tool_router: ToolRouter<Self>,
}

// ---------------- Imports das integrações (Fase D1) ----------------

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarPeriodArgs {
    /// First local day, YYYY-MM-DD. Omit both from and to for the current week.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// Last local day (inclusive), YYYY-MM-DD. With only `from`, that single day.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
}

// Inline pelo mesmo motivo do `ScheduleType`: o esquema sai plano.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum ImportScheduleType {
    SpecificDate,
    Recurring,
}

// Projeto e categoria que sobrescrevem a sugestão: ausente mantém a sugestão,
// `null` deixa sem — o TS distingue os dois, então o `Patch` os preserva.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogFields {
    /// Project id (from list_catalog, in the integration's workspace); takes precedence
    /// over projectName. null = no project. Omit to keep the suggestion. Changing the
    /// project without sending a category clears the category, as the app does.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub project_id: Patch<String>,
    /// Exact project name in the integration's workspace. null = no project.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub project_name: Patch<String>,
    /// Category id; takes precedence over categoryName. null = no category. Omit to keep
    /// the suggestion.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub category_id: Patch<String>,
    /// Exact category name in the integration's workspace. null = no category.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub category_name: Patch<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(inline)]
pub struct CalendarEventChoice {
    /// Event id from preview_calendar_import.
    pub id: String,
    #[serde(flatten)]
    pub catalog: ImportCatalogFields,
    /// `specific_date` (one planned task on the event's day) or `recurring`. Omit
    /// for the preview's suggestion.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_type: Option<ImportScheduleType>,
    /// Weekdays for `recurring`, 0 = Sunday … 6 = Saturday. Omit for the suggestion.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurring_days: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportCalendarEventsArgs {
    /// The same period used in preview_calendar_import. Omit both for the current week.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// The events to import, by id from the preview. Not empty.
    pub events: Vec<CalendarEventChoice>,
    /// Add an "open URL" action with the meeting link (or the event). Default true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub add_open_url_action: Option<bool>,
    /// Track the meetings (the app prompts at their start and end). Default false.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_meetings: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum TicketScheduleType {
    Recurring,
    SpecificDate,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(inline)]
pub struct ZendeskTicketChoice {
    /// Ticket id (a number) from preview_zendesk_import.
    pub id: i64,
    /// Planned task name. Omit or blank for "#<id> - <subject>".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(flatten)]
    pub catalog: ImportCatalogFields,
    /// Add an "open ticket" action. Default true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub add_open_url_action: Option<bool>,
    /// `recurring` (every day; the default) or `specific_date`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_type: Option<TicketScheduleType>,
    /// YYYY-MM-DD, used with `specific_date`. Default today.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_date: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ImportZendeskTicketsArgs {
    /// The tickets to import, by id from the preview. Not empty.
    pub tickets: Vec<ZendeskTicketChoice>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum MondayImportPeriodArg {
    Today,
    Week,
    Next30,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PreviewMondayImportArgs {
    /// `today`, `week` (the default; the week by the user's first weekday) or
    /// `next30` (today and the next 30 days). Items without a timeline always appear.
    pub period: Option<MondayImportPeriodArg>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(inline)]
pub struct MondayItemChoice {
    /// Item id from preview_monday_import.
    pub id: String,
    /// Category id (from list_catalog, in the integration's workspace); billable then
    /// follows the category's `defaultBillable`. null = no category. Omit for the
    /// suggestion.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub category_id: Patch<String>,
    /// Exact category name. null = no category.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub category_name: Patch<String>,
    /// Project Stage: an option label (or id) of the preview's `stageField`; "" clears
    /// it. Omit for the suggestion. Errors when no stage field is configured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_stage: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportMondayItemsArgs {
    /// The items to import, by id from the preview. Not empty.
    pub items: Vec<MondayItemChoice>,
    /// Add an "open in Monday" action. Default true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub add_open_url_action: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListClockifyEntriesArgs {
    /// First local day, YYYY-MM-DD. Default today.
    pub from: Option<String>,
    /// Last local day, YYYY-MM-DD (inclusive). Default `from`.
    pub to: Option<String>,
    /// Only entries that carry all the default tags. Default: on when default tags are
    /// configured, as the app's dialog opens.
    pub only_default_tags: Option<bool>,
}

// Inline pelo mesmo motivo do `ScheduleType`. Os nomes são os do modal.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub enum MondayEntriesPeriodArg {
    #[serde(rename = "today")]
    Today,
    #[serde(rename = "7days")]
    Last7Days,
    #[serde(rename = "30days")]
    Last30Days,
    #[serde(rename = "month")]
    Month,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListMondayEntriesArgs {
    /// `today`, `7days` (the default; today and the 6 days before), `30days` or `month`
    /// (from the 1st to today).
    pub period: Option<MondayEntriesPeriodArg>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListDaySummariesArgs {
    /// First local day, YYYY-MM-DD. Default today.
    pub from: Option<String>,
    /// Last local day, YYYY-MM-DD (inclusive). Default `from`. At most 366 days.
    pub to: Option<String>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDaySummariesArgs {
    /// First local day, YYYY-MM-DD. Default today.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// Last local day, YYYY-MM-DD (inclusive). Default `from`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// History filter that picks the days: only days with a finished task whose name
    /// contains this. Each day's summary still covers all its tasks.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// History filter that picks the days, by project id (from list_catalog).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// History filter that picks the days, by category id (from list_catalog).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    /// History filter that picks the days, by billable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub billable: Option<bool>,
}

// Fase D2b. Os campos do formulário de "Apontamentos do Clockify", comuns a
// criar e editar; vão no corpo, como na REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyEntryFields {
    /// Entry description (not empty).
    pub description: String,
    /// Clockify project id (from list_clockify_entries). Takes precedence over projectName.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Exact Clockify project name as the app shows it: "Client - Project" when the
    /// project has a client. One of projectId/projectName is required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    /// Local day, YYYY-MM-DD.
    pub date: String,
    /// Local start time, HH:MM.
    pub start: String,
    /// Local end time, HH:MM. Earlier than start = the next day.
    pub end: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateClockifyEntryArgs {
    #[serde(flatten)]
    pub fields: ClockifyEntryFields,
    /// Clockify tag ids. Takes precedence over tagNames. Omit both for the default
    /// tags, as the app's form starts; [] = no tags.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_ids: Option<Vec<String>>,
    /// Exact Clockify tag names.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_names: Option<Vec<String>>,
    /// Default false, as the app's form starts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub billable: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateClockifyEntryArgs {
    /// Clockify entry id, from list_clockify_entries.
    pub id: String,
    #[serde(flatten)]
    pub body: UpdateClockifyEntryBody,
}

/// O corpo; o `id` vai fora dele, como no path da REST.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateClockifyEntryBody {
    #[serde(flatten)]
    pub fields: ClockifyEntryFields,
    /// Clockify tag ids. Takes precedence over tagNames. One of the two is required
    /// ([] = no tags): the edit rewrites the whole entry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_ids: Option<Vec<String>>,
    /// Exact Clockify tag names.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_names: Option<Vec<String>>,
    pub billable: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ClockifyEntryIdArgs {
    /// Clockify entry id, from list_clockify_entries.
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMondayEntryArgs {
    /// The activity's `itemId`, from list_monday_entries.
    pub id: String,
    #[serde(flatten)]
    pub body: UpdateMondayEntryBody,
}

/// Ausente mantém o atual; `null` nos dois rótulos é a opção vazia do select.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMondayEntryBody {
    /// Activity name (not empty). Omit to keep it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Reported hours, decimal (e.g. 1.5), 0 or more. Omit to keep them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hours: Option<f64>,
    /// Billable. Only on boards with the Billing type column (an error otherwise).
    /// Omit to keep it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub billable: Option<bool>,
    /// One of the board's Activity Type labels (an error lists them). Omit to keep it;
    /// null leaves the column untouched.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub activity_type: Patch<String>,
    /// One of the board's Project Stage labels (an error lists them). Omit to keep it;
    /// null leaves the column untouched.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Option<String>")]
    pub project_stage: Patch<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct MondayEntryIdArgs {
    /// The activity's `itemId`, from list_monday_entries.
    pub id: String,
}

// Fase D3a. Configurações por grupo: tudo opcional, ausente mantém; vão no
// corpo, como na REST. Enums inline para o esquema sair plano.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum WeekStartArg {
    Monday,
    Sunday,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGeneralSettingsArgs {
    /// "Your name", shown in the Tasks screen header.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    /// Start DeskClock with the computer (registers it in the OS startup).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_on_boot: Option<bool>,
    /// Hide the main window when it loses focus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_on_focus_loss: Option<bool>,
    /// Show the narrow integrations rail on the right.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show_integrations_rail: Option<bool>,
    /// Discard tasks stopped with less than 1 minute.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discard_tasks_under_one_minute: Option<bool>,
    /// Round the duration to the active slots when a task stops.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rounding_enabled: Option<bool>,
    /// Active rounding slots in minutes: multiples of 5 up to 60 ([] = none). The
    /// whole list, not a diff.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rounding_slots: Option<Vec<u32>>,
    /// Rounding tolerance in minutes: one of 0, 1, 2, 5, 10, 15.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rounding_tolerance: Option<u32>,
    /// Daily goal in whole hours, 1 to 24.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub daily_goal_hours: Option<u32>,
    /// Weekly goal in whole hours, 1 to 168.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weekly_goal_hours: Option<u32>,
    /// First day of the week, for the whole app (weekly totals, period shortcuts,
    /// Planning, calendar).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub week_starts_on: Option<WeekStartArg>,
    /// Show Saturday and Sunday in Planning and in the recurrence days.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show_weekend: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOverlaySettingsArgs {
    /// Overlay opacity at rest, in percent: 20 to 100.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<u32>,
    /// Snap the overlay to a grid when dragging ends (no effect on Wayland).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snap_to_grid: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum ModeArg {
    Escuro,
    Claro,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum AccentArg {
    Azul,
    Verde,
    Roxo,
    Ambar,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct UpdateAccessibilitySettingsArgs {
    /// `escuro` (dark) or `claro` (light).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<ModeArg>,
    /// Accent color: `azul` (blue), `verde` (green), `roxo` (purple), `ambar` (amber).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<AccentArg>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateShortcutSettingsArgs {
    /// Start / pause / resume the task. "" removes the shortcut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toggle_task: Option<String>,
    /// Stop the task. "" removes the shortcut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_task: Option<String>,
    /// Show / hide the overlay. "" removes the shortcut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toggle_overlay: Option<String>,
    /// Show / hide the main window. "" removes the shortcut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toggle_window: Option<String>,
}

// Compartilhar tarefa: o contrato do link é do TS.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetTaskShareLinkArgs {
    /// Planned task id, from list_planned_tasks.
    pub planned_task_id: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSharedTaskArgs {
    /// The pasted deskclock://task/share?… link.
    pub link: String,
    /// Workspace whose projects, categories and fields the link is matched against
    /// (from list_catalog). Omit for the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum ShareModeArg {
    Plan,
    Start,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcceptSharedTaskArgs {
    /// The pasted deskclock://task/share?… link.
    pub link: String,
    /// `plan` = add as a planned task on `date`; `start` = start it now.
    pub mode: ShareModeArg,
    /// Only with `plan`: the day, YYYY-MM-DD. Omit for today.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    /// Workspace to create it in (from list_catalog). Omit for the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

// Fase D3b. Ajustes das integrações: tudo opcional, ausente mantém; vão no
// corpo, como na REST. Enums inline para o esquema sair plano.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "kebab-case")]
#[schemars(inline)]
pub enum AutoSyncModeArg {
    PerTask,
    Daily,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "kebab-case")]
#[schemars(inline)]
pub enum AutoSyncTriggerArg {
    OnOpen,
    FixedTime,
}

/// Os controles de "Envio automático", iguais no Sheets, no Clockify e no Monday.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutoSyncFields {
    /// Turn automatic sending of finished tasks on or off.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_sync_enabled: Option<bool>,
    /// `per-task` = each task as it is finished; `daily` = grouped, once a day.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_sync_mode: Option<AutoSyncModeArg>,
    /// Daily mode only: `on-open` = when the app opens (yesterday backwards); `fixed-time` =
    /// at autoSyncTime (today and missed days).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_sync_trigger: Option<AutoSyncTriggerArg>,
    /// Daily fixed-time only: local HH:MM (00:00 to 23:59).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_sync_time: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(inline)]
pub enum SheetFieldArg {
    Date,
    Name,
    Project,
    Category,
    Billable,
    StartTime,
    EndTime,
    Duration,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub struct SheetColumnArg {
    pub field: SheetFieldArg,
    /// Column header in the spreadsheet.
    pub label: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[schemars(inline)]
pub enum SheetDurationFormatArg {
    #[serde(rename = "HH:MM")]
    HhMm,
    #[serde(rename = "HH:MM:SS")]
    HhMmSs,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSheetsSettingsArgs {
    /// DeskClock workspace whose tasks are sent (from list_catalog).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// Google spreadsheet id (from its URL). Trimmed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spreadsheet_id: Option<String>,
    /// Sheet (tab) name; blank becomes "DeskClock".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sheet_name: Option<String>,
    /// The whole list of the eight columns, in spreadsheet order, each once — the only way
    /// to express order. Read the current one with get_sheets_settings and send it back
    /// changed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_mapping: Option<Vec<SheetColumnArg>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_format: Option<SheetDurationFormatArg>,
    #[serde(flatten)]
    pub auto_sync: AutoSyncFields,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCalendarSettingsArgs {
    /// DeskClock workspace of the manual "Import events" (from list_catalog). Automatic
    /// meeting tracking keeps creating in the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// Track meetings automatically (fetches today's events every 2 minutes and asks at
    /// start time).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_tracking_enabled: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum IgnoreOperatorArg {
    Equals,
    Contains,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct CalendarIgnoreRuleArgs {
    /// `equals` = the event name is exactly this; `contains` = the name contains it.
    pub operator: IgnoreOperatorArg,
    /// Event name. Case and surrounding spaces do not matter; accents do.
    pub value: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum BackupFrequencyArg {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct UpdateDriveBackupSettingsArgs {
    /// Automatic backup of the database to Google Drive.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// Counted from the last successful backup.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frequency: Option<BackupFrequencyArg>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateClockifySettingsArgs {
    /// DeskClock workspace where imported projects/tags are created and whose tasks are
    /// sent (from list_catalog).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// The Clockify workspace, one of list_clockify_workspaces.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clockify_workspace_id: Option<String>,
    #[serde(flatten)]
    pub auto_sync: AutoSyncFields,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MapClockifyProjectArgs {
    /// DeskClock project id (from list_catalog).
    pub project_id: String,
    /// Clockify project id (from list_clockify_catalog).
    pub clockify_project_id: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UnmapClockifyProjectArgs {
    /// DeskClock project id whose mapping is removed.
    pub project_id: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetClockifyCategoryTagsArgs {
    /// DeskClock category id (from list_catalog).
    pub category_id: String,
    /// The whole tag selection (ids from list_clockify_catalog); [] = no tags.
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetClockifyDefaultTagsArgs {
    /// Tags added to every entry sent (ids from list_clockify_catalog); [] = none.
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMondaySettingsArgs {
    /// DeskClock workspace of Monday projects, imported items and sent hours (from
    /// list_catalog).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// Portfolio board id (the board that lists the projects). Trimmed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub portfolio_board_id: Option<String>,
    /// Hours Report board id (the label catalog). Trimmed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub report_board_id: Option<String>,
    /// Import the user's items in linked boards as planned tasks, every 4 hours.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_import_enabled: Option<bool>,
    /// Select custom field (from list_custom_fields) feeding the Project Stage column;
    /// "" unlinks.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_stage_field_id: Option<String>,
    /// Select custom field feeding the Non Billable reason column; "" unlinks.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub non_billable_reason_field_id: Option<String>,
    #[serde(flatten)]
    pub auto_sync: AutoSyncFields,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateZendeskSettingsArgs {
    /// DeskClock workspace where imported tickets become planned tasks (from list_catalog).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum MondayCatalogFieldArg {
    ProjectStage,
    NonBillableReason,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct MondayCatalogFieldArgs {
    /// `project_stage` or `non_billable_reason`.
    pub field: MondayCatalogFieldArg,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetMondayProjectBoardArgs {
    /// Portfolio item id (`portfolioItemId` from get_monday_settings) of a project with no
    /// board.
    pub portfolio_item_id: String,
    /// Monday board id where this project's hours are written.
    pub board_id: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
pub enum SyncNowIntegrationArg {
    GoogleSheets,
    Monday,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct RunIntegrationSyncNowArgs {
    /// `google_sheets` or `monday` (Clockify has no "Send now").
    pub integration: SyncNowIntegrationArg,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InterpretTaskTextArgs {
    /// The user's short text, as they typed it — with or without siglas
    /// (`Daily sprint P=acme C=dev nb PS=dev`). Not empty.
    pub text: String,
    /// Workspace id (from list_catalog). Omit to use the active workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[tool_router]
impl DeskClockMcp {
    pub fn new(bridge: Arc<Bridge>) -> Self {
        Self {
            bridge,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        name = "get_status",
        description = "Current DeskClock state. Call it first in a conversation, and before \
            starting, pausing or stopping anything. Returns `running` (true while the timer \
            is counting), `task` (the active task — running or paused — or null; there is \
            only one active task across all workspaces, so `workspaceId` does not filter it), \
            `today` (today's totals in seconds for the requested workspace: totalSeconds, \
            billableSeconds, nonBillableSeconds, taskCount) and `clock` (the user's local \
            `date` as YYYY-MM-DD, `weekday` and `utcOffset`, taken at the same instant as \
            `today`). Use `clock` to resolve relative dates such as \"yesterday\" or \
            \"this week\". `workspaceId` only scopes `today`.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_status(&self, Parameters(args): Parameters<WorkspaceArgs>) -> CallToolResult {
        self.call_single(GET_STATUS, args.params()).await
    }

    #[tool(
        name = "list_catalog",
        description = "Workspaces, projects and categories known to DeskClock. Call it to \
            find valid names before referring to a project or category, or to pick a \
            workspace. Returns `workspaces` (all of them; `active` marks the one in use), \
            and `projects` and `categories` of the requested workspace (the active one \
            when `workspaceId` is omitted), each with `id` and `name`. Categories also \
            carry `defaultBillable`, the billable value a task gets by default in them. Custom \
            fields are not included: use list_custom_fields. Which categories each project \
            offers: list_project_categories.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_catalog(&self, Parameters(args): Parameters<WorkspaceArgs>) -> CallToolResult {
        let mut catalog = serde_json::Map::new();
        // `workspaces.list` ignora o `workspaceId`, então os params valem para as três.
        for OpCall { op, key } in ops_of(LIST_CATALOG) {
            let key = key.expect("list_catalog põe cada lista numa chave");
            match body_or_error(self.bridge.request(op, args.params()).await) {
                Ok(body) => catalog.insert(key.into(), body),
                Err(error) => return error,
            };
        }
        success(Value::Object(catalog))
    }

    // `openWorldHint` nas duas que param uma tarefa concluída (a troca do start
    // também): o envio automático por tarefa sai para Monday, Clockify ou Sheets.
    #[tool(
        name = "start_task",
        description = "Start timing a new task now. If a task is already running or \
            paused, it is stopped first with the same rules as stop_task (completed) and \
            the new one takes its place — there is only one active task. Use it when the \
            user starts working on something; to start a task from the plan, use \
            start_planned_task instead. Project and category are optional and must \
            already exist in the workspace: call list_catalog to find their exact names \
            or ids (an unknown one is an error; nothing is created). Returns the new task \
            (`id`, `name`, `projectName`, `categoryName`, `billable`, `status`, \
            `startTime` as an ISO datetime, `elapsedSeconds`).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn start_task(&self, Parameters(args): Parameters<StartTaskArgs>) -> CallToolResult {
        self.call_single(START_TASK, json!({ "body": args })).await
    }

    #[tool(
        name = "pause_task",
        description = "Pause the running task. The paused time is not counted; \
            resume_task continues the same task. Errors if no task is running (including \
            when it is already paused). Returns the task with `status: \"paused\"`.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn pause_task(&self) -> CallToolResult {
        self.call_single(PAUSE_TASK, json!({})).await
    }

    #[tool(
        name = "resume_task",
        description = "Resume the paused task. Errors if there is no paused task \
            (including when it is already running). Returns the task with \
            `status: \"running\"`.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn resume_task(&self) -> CallToolResult {
        self.call_single(RESUME_TASK, json!({})).await
    }

    #[tool(
        name = "stop_task",
        description = "Stop the active task (running or paused) and save it to the \
            history. The user's stop settings apply: if enabled, a task shorter than 1 \
            minute is discarded instead of saved, and the duration may be rounded. With \
            `completed` true (the default) the task's planned task, if any, is marked as \
            done for today and the task is sent in the background to the integrations \
            the user set to send automatically per task, if any; with false the time is \
            still saved, but the planned task stays pending and nothing is sent. Errors if there is no active task. Returns \
            `task`: the saved record (`durationSeconds`, `endTime`), or null when it was \
            discarded.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn stop_task(&self, Parameters(args): Parameters<StopTaskArgs>) -> CallToolResult {
        self.call_single(STOP_TASK, json!({ "body": args })).await
    }

    #[tool(
        name = "start_planned_task",
        description = "Start timing a planned task, like its Play button in the app: \
            the new task takes the planned task's name, project, category, billable and \
            workspace, and stopping it as completed marks the planned task as done for \
            the day. Get `id` from list_planned_tasks. Unlike start_task it does not \
            switch: if a task is already running or paused it errors — stop it (or ask \
            the user) first. An unknown `id` is an error. Returns the new task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn start_planned_task(
        &self,
        Parameters(args): Parameters<PlannedTaskIdArgs>,
    ) -> CallToolResult {
        self.call_single(START_PLANNED_TASK, json!({ "id": args.id }))
            .await
    }

    #[tool(
        name = "list_planned_tasks",
        description = "The user's planned tasks (the Planning screen). Use `date` for \
            what is planned on one day (recurring tasks by weekday and open periods \
            included), or `from`/`to` for everything that may occur in a range; with \
            none of them, all planned tasks of the workspace. Dates are YYYY-MM-DD in the \
            user's local time (get_status gives today). Returns `plannedTasks`, each with \
            `id` (for start_planned_task and log_planned_task), `name`, `projectName`, `categoryName`, \
            `billable`, `scheduleType` (specific_date, recurring or period) with its \
            `scheduleDate`, `recurringDays` (0 = Sunday) or `periodStart`/`periodEnd`, \
            optional `startTime`/`endTime` (HH:MM) and `completedDates` (YYYY-MM-DD \
            days on which it was done).",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_planned_tasks(
        &self,
        Parameters(args): Parameters<ListPlannedTasksArgs>,
    ) -> CallToolResult {
        self.call_single(LIST_PLANNED_TASKS, args.params()).await
    }

    #[tool(
        name = "plan_task",
        description = "Add a task to the user's plan (the Planning screen) without \
            timing anything: something to do on a given day, every week on some \
            weekdays, or every day of a period. Use start_task to start working now and \
            log_past_task for work already done. Set exactly the schedule fields of the \
            chosen `scheduleType`. Dates are YYYY-MM-DD and times of day HH:MM, both in \
            the user's local time (get_status gives today). Project and category are \
            optional and must already exist in the workspace: call list_catalog for \
            their exact names or ids (an unknown one is an error; nothing is created). \
            Returns the planned task, with the `id` that start_planned_task and \
            log_planned_task take.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn plan_task(&self, Parameters(args): Parameters<PlanTaskArgs>) -> CallToolResult {
        self.call_single(PLAN_TASK, json!({ "body": args })).await
    }

    #[tool(
        name = "log_past_task",
        description = "Record work already done, with its start and end — e.g. \"from \
            2pm to 3:30pm I worked on X\". It is saved directly to the history as a \
            finished task; the running task is not touched. If the work corresponds to \
            a planned task (see list_planned_tasks), use log_planned_task instead: it \
            also marks the planned task as done that day and keeps its data. \
            `startTime` and `endTime` are ISO 8601 datetimes, best with the user's UTC \
            offset from get_status (e.g. 2026-09-15T14:00:00-03:00); without an offset \
            they are read as the user's local time. The duration is end minus start and \
            must be at least 1 minute. Project and category must already exist (see \
            list_catalog). Returns the saved task (`id`, `startTime`/`endTime` in UTC, \
            `durationSeconds`).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn log_past_task(&self, Parameters(args): Parameters<LogPastTaskArgs>) -> CallToolResult {
        self.call_single(LOG_PAST_TASK, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "log_planned_task",
        description = "Record a planned task as done on a day, like the Manual Entry \
            screen: it saves a finished task with the planned task's name, project, \
            category, billable and custom fields, and marks the planned task as done on \
            that day. Get `id` from list_planned_tasks. `date` defaults to today and \
            cannot be in the future; the planned task must be scheduled on that day and \
            not already done on it. Times depend on the planned task: if it has \
            both `startTime` and `endTime` (HH:MM) in list_planned_tasks, those are \
            used and sending `startTime`/`endTime` here is an error; if it does not \
            have both, both are required here — ISO 8601 datetimes with the user's UTC offset from get_status \
            (e.g. 2026-09-15T14:00:00-03:00), the start on `date`, at least 1 minute \
            long. When retrying, send `date` explicitly: without it a retry after \
            midnight targets the next day. Returns the saved task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn log_planned_task(
        &self,
        Parameters(args): Parameters<LogPlannedTaskArgs>,
    ) -> CallToolResult {
        self.call_single(
            LOG_PLANNED_TASK,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "list_tasks",
        description = "The user's finished tasks (the History screen) in a range of \
            days, newest first. Days are YYYY-MM-DD in the user's local time \
            (get_status gives today); with no dates, today. Filters combine: name \
            text, project id, category id (ids from list_catalog) and billable. The \
            running or paused task is not included (see get_status). Returns `tasks`, \
            each with `id`, `name`, `projectName`, `categoryName`, `billable`, \
            `startTime`/`endTime` (ISO datetimes in UTC) and `durationSeconds`.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_tasks(&self, Parameters(args): Parameters<ListTasksArgs>) -> CallToolResult {
        self.call_single(LIST_TASKS, args.params()).await
    }

    #[tool(
        name = "get_totals",
        description = "Time totals of the finished tasks in a range of days, as the \
            History screen sums them. Days are YYYY-MM-DD in the user's local time; \
            with no dates, today. For a calendar week as the user's app defines it, use \
            get_week_totals. Returns `from`, `to`, `totalSeconds`, `billableSeconds`, \
            `nonBillableSeconds` and `count` (number of tasks).",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_totals(&self, Parameters(args): Parameters<GetTotalsArgs>) -> CallToolResult {
        self.call_single(GET_TOTALS, args.params()).await
    }

    #[tool(
        name = "get_week_totals",
        description = "Total time recorded in the week that contains `date` \
            (YYYY-MM-DD; default today), as the Tasks screen shows it. Unlike \
            get_totals, it also counts the active (running or paused) task: the time it \
            had up to its last pause, and its day in `daysWorked` — so while a task is \
            active the two can differ for the same days. The week \
            starts on the weekday set in the user's settings, not necessarily Monday — \
            the result says which days it covers. Returns `weekStart`, `weekEnd`, \
            `totalSeconds` and `daysWorked`. For any other range, or to split billable \
            time, use get_totals.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_week_totals(
        &self,
        Parameters(args): Parameters<GetWeekTotalsArgs>,
    ) -> CallToolResult {
        self.call_single(GET_WEEK_TOTALS, args.params()).await
    }

    #[tool(
        name = "list_custom_fields",
        description = "The user's custom fields: extra data a task can carry, defined \
            once for all workspaces (archived ones included). Returns `customFields`, each \
            with `id`, `label`, `type` (text, multiline, select or checkbox), `options`, \
            `sortOrder` and `archived`. The field `id` is the key of a task's \
            `customValues`. In a `select` field, each option has an `id` and a `label`, \
            and the API accepts either of them when saving a value.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_custom_fields(&self) -> CallToolResult {
        self.call_single(LIST_CUSTOM_FIELDS, json!({})).await
    }

    #[tool(
        name = "create_custom_field",
        description = "Create a custom field. `type` is text, multiline, select or \
            checkbox and cannot be changed afterwards; a `select` needs `optionLabels` \
            (at least one), the other types take none. The label must not already \
            exist (an error otherwise). Returns the new field, with the `id` used as \
            the key of `customValues`.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn create_custom_field(
        &self,
        Parameters(args): Parameters<CreateCustomFieldArgs>,
    ) -> CallToolResult {
        self.call_single(CREATE_CUSTOM_FIELD, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_custom_field",
        description = "Rename a custom field, change the options of a `select`, or \
            archive or restore it. Get `id` from list_custom_fields. Omitted fields are \
            kept. `optionLabels` is the final list of options in the desired order: an \
            existing option is matched by its label and keeps its id — and the values \
            already saved in tasks — while an option left out is removed and a new label \
            becomes a new option. The field type cannot be changed. Returns the updated \
            field.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_custom_field(
        &self,
        Parameters(args): Parameters<UpdateCustomFieldArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_CUSTOM_FIELD,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "delete_custom_field",
        description = "Permanently delete a custom field. It erases that field's value \
            in every task of the History and of the Planning, and it cannot be undone. \
            Call it only when the user explicitly asked to delete the field. To just \
            stop using it, archive it instead with update_custom_field \
            (archived = true), which is reversible and keeps the values. Get `id` from \
            list_custom_fields. Errors if the field does not exist (so a repeated call \
            only errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_custom_field(
        &self,
        Parameters(args): Parameters<DeleteCustomFieldArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_CUSTOM_FIELD, json!({ "id": args.id }))
            .await
    }

    // Edição: nenhuma dispara o envio às integrações — só o `stop` dispara
    // (`usePostStopLogic`); estas gravam no banco e emitem eventos locais.
    #[tool(
        name = "update_running_task",
        description = "Edit the active task (running or paused): name, project, \
            category, billable, start time and custom field values. Only what you send \
            changes: an omitted field is kept, and null clears where the field says so. \
            Project and category must exist in the task's workspace (see list_catalog). \
            If the task was started from a planned task, the new name, project, \
            category, billable and custom values also go to that planned task, so its \
            next occurrences carry them; the start time and a removed name do not. \
            Errors if no task is active. For a finished task use update_task. Returns \
            the task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_running_task(
        &self,
        Parameters(args): Parameters<UpdateRunningTaskArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_RUNNING_TASK, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_task",
        description = "Edit a finished task of the History: name, project, category, \
            billable, start and end, custom field values. Get `id` from list_tasks. Only \
            what you send changes: an omitted field is kept, and null clears where the \
            field says so. Sending startTime or endTime recalculates the duration. \
            Project and category must exist in the task's workspace (see list_catalog). \
            The resulting billable value applies to the task's whole group — the \
            finished tasks of the same day with the same name, project, category and \
            custom values — as the app's edit dialog does. The active task cannot be \
            edited here (an error): use update_running_task. Returns the task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_task(&self, Parameters(args): Parameters<UpdateTaskArgs>) -> CallToolResult {
        self.call_single(UPDATE_TASK, json!({ "id": args.id, "body": args.body }))
            .await
    }

    #[tool(
        name = "update_planned_task",
        description = "Edit a planned task of the Planning: name, project, category, \
            billable, schedule, time of day, quick actions and custom field values. Get \
            `id` from list_planned_tasks. Only what you send changes: an omitted field \
            is kept; null clears project, category, startTime/endTime, actions and \
            customValues, and is an error in name and scheduleType. To change \
            scheduleType, send in the same call the fields of the new type (scheduleDate; \
            recurringDays; periodStart, periodEnd optional) — the old type's are cleared; a \
            schedule field of another type is an error. `customValues` and `actions` \
            replace the whole map or list. Project and category must exist in the \
            planned task's workspace (see list_catalog); the workspace cannot change. \
            Returns the planned task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_planned_task(
        &self,
        Parameters(args): Parameters<UpdatePlannedTaskArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_PLANNED_TASK,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "complete_planned_task",
        description = "Mark a planned task as done on a day without recording any \
            time, like its check circle in the Planning. To also record the time worked, \
            use log_planned_task instead. Get `id` from list_planned_tasks. `date` \
            defaults to today; the day is not checked against the schedule. A day \
            already marked stays as it is. Returns the planned task, with \
            `completedDates`.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn complete_planned_task(
        &self,
        Parameters(args): Parameters<CompletePlannedTaskArgs>,
    ) -> CallToolResult {
        self.call_single(
            COMPLETE_PLANNED_TASK,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "uncomplete_planned_task",
        description = "Unmark a day on which a planned task was marked as done, so it \
            is pending again that day. Get `id` and the day from `completedDates` in \
            list_planned_tasks. Tasks already recorded in the History are not touched. \
            A day that was not marked stays as it is. Returns the planned task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn uncomplete_planned_task(
        &self,
        Parameters(args): Parameters<UncompletePlannedTaskArgs>,
    ) -> CallToolResult {
        self.call_single(
            UNCOMPLETE_PLANNED_TASK,
            json!({ "id": args.id, "date": args.date }),
        )
        .await
    }

    #[tool(
        name = "duplicate_planned_task",
        description = "Copy a planned task, like Duplicate in the Planning: the copy has \
            the same name, schedule, time of day, project, category, billable, actions \
            and custom values, and no completed days. Get `id` from list_planned_tasks. \
            Each call creates another copy. Returns the new planned task, with its own \
            `id`.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn duplicate_planned_task(
        &self,
        Parameters(args): Parameters<PlannedTaskIdArgs>,
    ) -> CallToolResult {
        self.call_single(DUPLICATE_PLANNED_TASK, json!({ "id": args.id }))
            .await
    }

    #[tool(
        name = "delete_planned_task",
        description = "Permanently delete a planned task, with all its occurrences and \
            completed days. The deletion is immediate and cannot be undone. Call it only \
            when the user explicitly asked to delete the planned task. Tasks already \
            recorded in the History are kept. Get `id` from list_planned_tasks. Errors \
            if it does not exist (so a repeated call only errors). Returns an empty \
            object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_planned_task(
        &self,
        Parameters(args): Parameters<PlannedTaskIdArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_PLANNED_TASK, json!({ "id": args.id }))
            .await
    }

    #[tool(
        name = "cancel_task",
        description = "Discard the active task (running or paused) without saving it: \
            its time is lost and nothing goes to the History. The discard is immediate \
            and cannot be undone. Call it only when the user wants to throw the time \
            away; to keep the time, use stop_task. Errors if there is no active task (so \
            a repeated call only errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn cancel_task(&self) -> CallToolResult {
        self.call_single(CANCEL_TASK, json!({})).await
    }

    // ---------------- Fase B: Histórico ----------------
    // Nenhuma passa pelo `usePostStopLogic`: só gravam no banco e emitem eventos
    // locais, então `openWorldHint: false` em todas as desta fase.

    #[tool(
        name = "delete_task",
        description = "Permanently delete one finished task of the History. The deletion \
            is immediate and, unlike in the app, cannot be undone. Call it only when the \
            user explicitly asked to delete it. Get `id` from list_tasks. The active task \
            cannot be deleted here (an error): use cancel_task. Errors if it does not \
            exist (so a repeated call only errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_task(&self, Parameters(args): Parameters<TaskIdArgs>) -> CallToolResult {
        self.call_single(DELETE_TASK, json!({ "id": args.id }))
            .await
    }

    #[tool(
        name = "delete_tasks",
        description = "Permanently delete several finished tasks of the History at once. \
            The deletion is immediate and, unlike in the app, cannot be undone. Call it \
            only when the user explicitly asked to delete these tasks. Get the ids from \
            list_tasks. All or nothing: if any id does not exist or is the active task, \
            nothing is deleted and it errors (so a repeated call only errors). Returns an \
            empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_tasks(&self, Parameters(args): Parameters<TaskIdsArgs>) -> CallToolResult {
        self.call_single(DELETE_TASKS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "set_task_billable",
        description = "Set whether a finished task is billable, like clicking its billable \
            indicator in the app. The value applies to the task's whole group — the \
            finished tasks of the same day and workspace with the same name, project, \
            category and custom values. Get `id` from list_tasks. To change other fields \
            too, use update_task. The active task cannot be changed here (an error): use \
            update_running_task. Returns the task.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn set_task_billable(
        &self,
        Parameters(args): Parameters<SetTaskBillableArgs>,
    ) -> CallToolResult {
        self.call_single(
            SET_TASK_BILLABLE,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "merge_tasks",
        description = "Merge a group of finished tasks into a single record, like Merge \
            (Unificar) on a group in the app: the new record starts at the earliest \
            start, ends at the latest end and has the summed duration, and the original \
            records are deleted. It is immediate and cannot be undone. Call it only when \
            the user asked to merge. Only today's tasks can be merged, as in the app. \
            Send at least two ids (from list_tasks) of the same group: same day and \
            workspace, same name, project, category and custom values; anything else is \
            an error and nothing changes. The active task cannot be included. Returns \
            the merged task, with its new `id`.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn merge_tasks(&self, Parameters(args): Parameters<TaskIdsArgs>) -> CallToolResult {
        self.call_single(MERGE_TASKS, json!({ "body": args })).await
    }

    #[tool(
        name = "move_tasks_to_workspace",
        description = "Move or copy finished tasks to another workspace, like Move to \
            workspace in the app. Projects and categories belong to a workspace, so for \
            each one say what it becomes in the destination: `match` an existing one \
            there (targetId), `create` one there by name (an existing one with that name \
            is reused), or `unset`. The same choice applies to all the tasks sent; call \
            list_catalog with the destination's workspaceId to find matches. Custom \
            values go along unchanged. `mode` `move` reassigns the tasks; `copy` creates \
            copies in the destination and keeps the originals, so each call copies them \
            again. All or nothing: an unknown id, the active task, or a task already in \
            the destination is an error and nothing changes. Returns `count`, the number \
            of tasks moved or copied.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn move_tasks_to_workspace(
        &self,
        Parameters(args): Parameters<MoveTasksArgs>,
    ) -> CallToolResult {
        self.call_single(MOVE_TASKS_TO_WORKSPACE, json!({ "body": args }))
            .await
    }

    // ---------------- Fase B: Projetos ----------------

    #[tool(
        name = "create_project",
        description = "Create a project in a workspace (the active one when workspaceId is \
            omitted). The name must not already exist there (an error otherwise, so a \
            repeated call only errors); its color is assigned by the app. To create many \
            at once, use import_projects. Returns the project (`id`, `workspaceId`, \
            `name`, `colorIndex`).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn create_project(
        &self,
        Parameters(args): Parameters<CreateProjectArgs>,
    ) -> CallToolResult {
        self.call_single(CREATE_PROJECT, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_project",
        description = "Rename a project. Get `id` from list_catalog; pass the project's \
            workspaceId when it is not in the active workspace. The new name must not \
            belong to another project of the workspace. Tasks and planned tasks keep \
            pointing to it and show the new name. Returns the project.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_project(
        &self,
        Parameters(args): Parameters<UpdateProjectArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_PROJECT,
            json!({
                "id": args.id,
                "workspaceId": args.workspace_id,
                "body": args.body,
            }),
        )
        .await
    }

    #[tool(
        name = "delete_project",
        description = "Permanently delete a project from its workspace. The deletion is \
            immediate and cannot be undone. Call it only when the user explicitly asked \
            to delete the project. Recorded tasks and planned tasks are kept, without \
            the project. Get `id` from list_catalog; pass the project's workspaceId when \
            it is not in the active workspace. Errors if it does not exist there (so a \
            repeated call only errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_project(&self, Parameters(args): Parameters<ProjectIdArgs>) -> CallToolResult {
        self.call_single(DELETE_PROJECT, args.params()).await
    }

    #[tool(
        name = "import_projects",
        description = "Create many projects at once, like the bulk import of the Data \
            screen: `text` has one project name per line; blank lines are ignored. A name \
            that already exists in the workspace is skipped, not an error, so repeating \
            the call creates nothing new. Returns `created` (how many) and `skipped` (the \
            lines not imported).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn import_projects(
        &self,
        Parameters(args): Parameters<ImportCatalogArgs>,
    ) -> CallToolResult {
        self.call_single(IMPORT_PROJECTS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "delete_projects",
        description = "Permanently delete several projects of one workspace at once. The \
            deletion is immediate and cannot be undone. Call it only when the user \
            explicitly asked to delete these projects. Recorded tasks and planned tasks \
            are kept, without the project. All or nothing: if any id is not a project of \
            the workspace, nothing is deleted and it errors (so a repeated call only \
            errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_projects(
        &self,
        Parameters(args): Parameters<DeleteManyArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_PROJECTS, json!({ "body": args }))
            .await
    }

    // ---------------- Fase B: Categorias ----------------

    #[tool(
        name = "create_category",
        description = "Create a category in a workspace (the active one when workspaceId \
            is omitted). The name must not already exist there (an error otherwise, so a \
            repeated call only errors). `defaultBillable` (default true) is the billable \
            value a task gets when this category is chosen. To create many at once, use \
            import_categories. Returns the category (`id`, `workspaceId`, `name`, \
            `defaultBillable`).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn create_category(
        &self,
        Parameters(args): Parameters<CreateCategoryArgs>,
    ) -> CallToolResult {
        self.call_single(CREATE_CATEGORY, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_category",
        description = "Rename a category and/or change its default billable value. Get \
            `id` from list_catalog; pass the category's workspaceId when it is not in the \
            active workspace. `name` is always required (send the current one to keep \
            it) and must not belong to another category of the workspace; an omitted \
            `defaultBillable` is kept. Tasks already recorded keep their billable value. \
            Returns the category.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_category(
        &self,
        Parameters(args): Parameters<UpdateCategoryArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_CATEGORY,
            json!({ "id": args.id, "workspaceId": args.workspace_id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "delete_category",
        description = "Permanently delete a category from its workspace. The deletion is \
            immediate and cannot be undone. Call it only when the user explicitly asked \
            to delete the category. Recorded tasks and planned tasks are kept, without \
            the category. Get `id` from list_catalog; pass the category's workspaceId \
            when it is not in the active workspace. Errors if it does not exist there (so \
            a repeated call only errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_category(
        &self,
        Parameters(args): Parameters<CategoryIdArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_CATEGORY, args.params()).await
    }

    #[tool(
        name = "import_categories",
        description = "Create many categories at once, like the bulk import of the Data \
            screen: `text` has one category name per line; blank lines are ignored. A \
            line starting with `!` creates the category as non-billable by default (e.g. \
            `!Internal meetings`); without it, billable. A name that already exists in \
            the workspace is skipped, not an error, so repeating the call creates nothing \
            new. Returns `created` (how many) and `skipped` (the lines not imported).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn import_categories(
        &self,
        Parameters(args): Parameters<ImportCatalogArgs>,
    ) -> CallToolResult {
        self.call_single(IMPORT_CATEGORIES, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "delete_categories",
        description = "Permanently delete several categories of one workspace at once. The \
            deletion is immediate and cannot be undone. Call it only when the user \
            explicitly asked to delete these categories. Recorded tasks and planned tasks \
            are kept, without the category. All or nothing: if any id is not a category \
            of the workspace, nothing is deleted and it errors (so a repeated call only \
            errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_categories(
        &self,
        Parameters(args): Parameters<DeleteManyArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_CATEGORIES, json!({ "body": args }))
            .await
    }

    // ---------------- Fase B: Categorias por projeto ----------------

    #[tool(
        name = "list_project_categories",
        description = "The categories associated with a project (Categories per project \
            on the Data screen). When a project has associated categories, the app \
            offers only those for it; an empty list means the project offers every \
            category of its workspace. Get `id` from list_catalog; pass the project's \
            workspaceId when it is not in the active workspace. Returns \
            `projectCategories`, each with `categoryId` (see list_catalog for the name), \
            `source` (`manual`, or `monday` when it came from the Monday sync) and \
            `createdAt`.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_project_categories(
        &self,
        Parameters(args): Parameters<ProjectIdArgs>,
    ) -> CallToolResult {
        self.call_single(LIST_PROJECT_CATEGORIES, args.params())
            .await
    }

    #[tool(
        name = "set_project_categories",
        description = "Set which categories a project offers. `categoryIds` is the final \
            list, REPLACING the current one: a category left out is removed, including \
            one that came from the Monday sync (it comes back at the next sync unless it \
            is removed in the Monday board). `[]` removes the filter, so the project \
            offers every category again. The categories must belong to the project's \
            workspace (see list_catalog). To add one category, read the current list \
            with list_project_categories and send it back with the new id. Returns \
            `projectCategories`, as list_project_categories.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn set_project_categories(
        &self,
        Parameters(args): Parameters<SetProjectCategoriesArgs>,
    ) -> CallToolResult {
        self.call_single(
            SET_PROJECT_CATEGORIES,
            json!({ "id": args.id, "workspaceId": args.workspace_id, "body": args.body }),
        )
        .await
    }

    // ---------------- Fase B: Workspaces ----------------

    #[tool(
        name = "create_workspace",
        description = "Create a workspace. It does not become the active one: use \
            set_active_workspace for that. The name must not already exist (an error \
            otherwise, so a repeated call only errors). `color` is a palette slot (rose, \
            orange, amber, lime, teal, cyan, violet, fuchsia); omitted, it is derived \
            from the name. Returns the workspace (`id`, `name`, `color`, `createdAt`, \
            `active`).",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn create_workspace(
        &self,
        Parameters(args): Parameters<CreateWorkspaceArgs>,
    ) -> CallToolResult {
        self.call_single(CREATE_WORKSPACE, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_workspace",
        description = "Rename and/or recolor a workspace. Get `id` from list_catalog. \
            `name` is always required (send the current one to keep it) and must not \
            belong to another workspace; an omitted `color` is kept. Returns the \
            workspace.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_workspace(
        &self,
        Parameters(args): Parameters<UpdateWorkspaceArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_WORKSPACE,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "delete_workspace",
        description = "Permanently delete a workspace. Call it only when the user \
            explicitly asked to delete it AND said what to do with its data — if they \
            did not, ask; the app also makes them choose. `mode` `move` moves all its \
            data (tasks, planned tasks, projects, categories, export profiles) to \
            `toWorkspaceId`, where a project or category with the same name is merged \
            into the existing one; `delete` erases all of it — months of recorded hours \
            may go with it. It is immediate and cannot be undone. Deleting the active \
            workspace makes the destination (or, with `delete`, the first remaining one) \
            active. Integrations set to use this workspace stop until another one is \
            chosen for them in the app. Errors, changing nothing: the last workspace, a \
            destination that does not exist, or an active task (running or paused) in \
            this workspace — stop it with stop_task, or discard it with cancel_task, \
            first. Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_workspace(
        &self,
        Parameters(args): Parameters<DeleteWorkspaceArgs>,
    ) -> CallToolResult {
        self.call_single(
            DELETE_WORKSPACE,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "set_active_workspace",
        description = "Switch the active workspace in every DeskClock window. New records \
            are created in the active workspace, and tools called without workspaceId \
            use it. Switching to another workspace while a task is active (running or \
            paused) errors and does not switch: unlike the app, which asks whether the \
            task was completed and stops it, this tool never stops it. Ask the user, \
            stop it with stop_task (with \
            `completed` as they answered) or discard it with cancel_task, then call \
            again. Switching to the workspace that is already active changes nothing. \
            Get `id` from list_catalog. Returns the workspace now active.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn set_active_workspace(
        &self,
        Parameters(args): Parameters<SetActiveWorkspaceArgs>,
    ) -> CallToolResult {
        self.call_single(SET_ACTIVE_WORKSPACE, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "preview_send_to_integration",
        description = "List what can be sent to an integration (Google Sheets, Clockify or \
            Monday), like the app's Send dialog: the finished tasks of the period in the \
            DeskClock workspace configured for that integration (not necessarily the active \
            one), by day and group, each with `state` — `pending` (can be sent; the app \
            preselects these), `sent` (already sent; sending again is allowed but may \
            duplicate, see `resendWarning`) or `invalid` (missing data listed in `missing`; \
            cannot be sent). `sendWarning`, when not null, is what would block sending the \
            pending groups. Call it before send_tasks_to_integration, show the user what \
            will go up, and only send after they confirm. Errors if the integration is not \
            configured. Reads only local data.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn preview_send_to_integration(
        &self,
        Parameters(args): Parameters<PreviewSendArgs>,
    ) -> CallToolResult {
        self.call_single(
            PREVIEW_SEND_TO_INTEGRATION,
            json!({ "id": args.integration, "from": args.from, "to": args.to }),
        )
        .await
    }

    #[tool(
        name = "send_tasks_to_integration",
        description = "Send tasks to Google Sheets, Clockify or Monday, like the Send button \
            of the app's dialog. Call preview_send_to_integration first, show the user the \
            groups that will go up, and call this only after they confirm. Pass `taskIds` \
            from the preview; each id sends its whole group. Writes to the external service: \
            Sheets and Clockify append a new row or entry on every send, so sending again \
            duplicates; Monday rewrites the existing activity. Returns `sentTaskIds` (marked \
            as sent), `skippedTaskIds` (already identical in Monday), `refused` (the \
            destination rejected the data; the user must fix the task) and `failed` \
            (technical errors; retry), plus `message`, the sentence the app would show. \
            Errors without sending if a task is not finished, is outside the integration's \
            workspace, misses required data, or the integration is not configured.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn send_tasks_to_integration(
        &self,
        Parameters(args): Parameters<SendTasksArgs>,
    ) -> CallToolResult {
        self.call_single(
            SEND_TASKS_TO_INTEGRATION,
            json!({ "id": args.integration, "body": args }),
        )
        .await
    }

    // ---------------- Fase C2: Exportação ----------------
    // Nenhuma grava arquivo nem fala com serviço externo: perfis ficam no banco
    // local, e o export_tasks só lê.

    #[tool(
        name = "list_export_profiles",
        description = "The export profiles of a workspace (the active one when \
            workspaceId is omitted), default first. Returns `exportProfiles`, each with \
            `id`, `name`, `isDefault`, `format` (csv or json), `separator`, \
            `durationFormat`, `dateFormat` and `columns` ({ field, label, visible, \
            order }). Use an `id` as profileId in export_tasks.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_export_profiles(
        &self,
        Parameters(args): Parameters<WorkspaceArgs>,
    ) -> CallToolResult {
        self.call_single(LIST_EXPORT_PROFILES, args.params()).await
    }

    #[tool(
        name = "create_export_profile",
        description = "Create an export profile, like the app's Export dialog > Profiles > \
            New profile. Omitted fields take the form's defaults: csv, comma, hh:mm:ss, iso, \
            not default, and the seven system columns visible (name, project, category, \
            billable, startTime, endTime, durationSeconds); active custom fields are added as \
            invisible columns. Names may repeat, so calling again creates another profile. \
            Returns the profile.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn create_export_profile(
        &self,
        Parameters(args): Parameters<CreateExportProfileArgs>,
    ) -> CallToolResult {
        self.call_single(CREATE_EXPORT_PROFILE, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_export_profile",
        description = "Edit an export profile: name, default flag, format, separator, \
            duration and date formats, or columns. Get `id` from list_export_profiles; pass \
            the profile's workspaceId when it is not in the active workspace. Omitted fields \
            are kept. `columns` is the final list (to change one column, send them all, as \
            listed). Returns the profile.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_export_profile(
        &self,
        Parameters(args): Parameters<UpdateExportProfileArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_EXPORT_PROFILE,
            json!({ "id": args.id, "workspaceId": args.workspace_id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "delete_export_profile",
        description = "Permanently delete an export profile. The deletion is immediate and \
            cannot be undone. Call it only when the user explicitly asked to delete the \
            profile. The only profile of a workspace cannot be deleted (an error). Get `id` \
            from list_export_profiles; pass the profile's workspaceId when it is not in the \
            active workspace. Errors if it does not exist there (so a repeated call only \
            errors). Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_export_profile(
        &self,
        Parameters(args): Parameters<ExportProfileIdArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_EXPORT_PROFILE, args.params()).await
    }

    #[tool(
        name = "set_default_export_profile",
        description = "Make an export profile the default of its workspace; the previous \
            default stops being one. export_tasks uses the default when no profileId is \
            given. Get `id` from list_export_profiles. Returns the profile.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn set_default_export_profile(
        &self,
        Parameters(args): Parameters<ExportProfileIdArgs>,
    ) -> CallToolResult {
        self.call_single(SET_DEFAULT_EXPORT_PROFILE, args.params())
            .await
    }

    #[tool(
        name = "export_tasks",
        description = "Export the finished tasks of a period as CSV or JSON with an export \
            profile, like the app's Export dialog. Tasks with the same name, project, \
            category and custom field values become one record with the summed duration. \
            Nothing is saved: the file content comes in the response — `content` (the text), \
            `fileName` (suggested: export.csv or export.json), `format`, `mimeType` and \
            `rowCount` (0 gives an empty CSV or `[]`). Give the text to the user, or save it \
            with your own tools if they asked for a file. Uses the workspace's default \
            profile when profileId is omitted, and all tasks of the period unless taskIds is \
            given.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn export_tasks(&self, Parameters(args): Parameters<ExportTasksArgs>) -> CallToolResult {
        self.call_single(EXPORT_TASKS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "preview_calendar_import",
        description = "List the Google Calendar events of a period that can be imported as \
            planned tasks, like the app's Import events dialog: each with the suggestion that \
            is imported if left unchanged (project/category from the event description, \
            `recurring` for a series with the suggested weekdays) and the app's flags — \
            `alreadyExists` (a planned task with the same name is already in the period), \
            `ignored` (matches an ignore rule) and `preselected` (neither; what the app \
            preselects). The planned tasks go to the DeskClock workspace configured for the \
            calendar import (not necessarily the active one). Weekend events are left out \
            when the app hides the weekend. Show the user this list before importing. Errors \
            if Google is not connected. Reads Google Calendar.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn preview_calendar_import(
        &self,
        Parameters(args): Parameters<CalendarPeriodArgs>,
    ) -> CallToolResult {
        self.call_single(
            PREVIEW_CALENDAR_IMPORT,
            json!({ "from": args.from, "to": args.to }),
        )
        .await
    }

    #[tool(
        name = "import_calendar_events",
        description = "Import Google Calendar events as planned tasks, like the Import \
            button of the app's dialog. Call preview_calendar_import first, show the user the \
            events and import only what they confirm, with the same `from`/`to`. Each event \
            takes the preview's suggestion unless you override it. Recurring events with the \
            same name and time become one planned task with their weekdays merged \
            (`mergedEventIds`). It does not check duplicates: importing an event again creates \
            another planned task (see `alreadyExists`). Returns the created planned tasks and \
            how many meetings are now tracked.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn import_calendar_events(
        &self,
        Parameters(args): Parameters<ImportCalendarEventsArgs>,
    ) -> CallToolResult {
        self.call_single(IMPORT_CALENDAR_EVENTS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "preview_zendesk_import",
        description = "List the open Zendesk tickets assigned to the user that can be \
            imported as planned tasks, like the app's Import tickets dialog, each with what \
            is imported if left unchanged: name \"#<id> - <subject>\", recurring every day, an \
            \"open ticket\" action. The planned tasks go to the DeskClock workspace configured \
            for Zendesk. Show the user this list before importing. The app does not mark \
            tickets already imported. Errors if Zendesk is not connected. Reads Zendesk.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn preview_zendesk_import(&self) -> CallToolResult {
        self.call_single(PREVIEW_ZENDESK_IMPORT, json!({})).await
    }

    #[tool(
        name = "import_zendesk_tickets",
        description = "Import Zendesk tickets as planned tasks, like the Import button of the \
            app's dialog. Call preview_zendesk_import first, show the user the tickets and \
            import only what they confirm. Each ticket takes the app's defaults unless you \
            override them. It does not check duplicates: importing a ticket again creates \
            another planned task. Returns how many were created.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn import_zendesk_tickets(
        &self,
        Parameters(args): Parameters<ImportZendeskTicketsArgs>,
    ) -> CallToolResult {
        self.call_single(IMPORT_ZENDESK_TICKETS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "preview_monday_import",
        description = "List the user's Monday items (outside the Activities group, on the \
            boards linked to DeskClock projects) that can be imported as planned tasks, like \
            the app's Import items dialog: each with its project, timeline, the suggested \
            category (from Activity Type, billable following it) and Project Stage, and \
            `alreadyImported` (it already has a live planned task — importing it again is \
            refused) and `alreadyExists` (a planned task with the same name exists). The \
            planned tasks go to the DeskClock workspace configured for Monday. Show the user \
            this list before importing. Errors if Monday is not configured, no board is \
            linked, or the linked boards point to another workspace. Reads Monday.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn preview_monday_import(
        &self,
        Parameters(args): Parameters<PreviewMondayImportArgs>,
    ) -> CallToolResult {
        self.call_single(PREVIEW_MONDAY_IMPORT, json!({ "period": args.period }))
            .await
    }

    #[tool(
        name = "import_monday_items",
        description = "Import Monday items as planned tasks, like the Import button of the \
            app's dialog. Call preview_monday_import first, show the user the items and \
            import only what they confirm. The schedule comes from the item's timeline (no \
            timeline = today); category and Project Stage take the suggestion unless you \
            override them. Records the link the automatic Monday import uses, so the item is \
            not created again. Errors without importing if an item already has a planned task \
            or is not among the user's items.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn import_monday_items(
        &self,
        Parameters(args): Parameters<ImportMondayItemsArgs>,
    ) -> CallToolResult {
        self.call_single(IMPORT_MONDAY_ITEMS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "import_monday_projects",
        description = "Import or update the DeskClock projects from the Monday Portfolio \
            board, like the Projects \"Import\"/\"Update\" button in Integrations → Monday: \
            every classified Portfolio item becomes a project in the workspace configured for \
            Monday, with the board where its hours go, and the board's Activity Types become \
            the categories the project offers. Existing projects are reused, not duplicated. \
            Reads every linked board's schema, so it can take a while. Returns how many \
            projects, those without a board, the boards outside the template and why.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn import_monday_projects(&self) -> CallToolResult {
        self.call_single(IMPORT_MONDAY_PROJECTS, json!({})).await
    }

    #[tool(
        name = "import_monday_categories",
        description = "Create one DeskClock category per Monday Activity Type, like the \
            Categories \"Import\" button in Integrations → Monday, in the workspace configured \
            for Monday. Uses the labels already read (read_monday_catalogs and \
            import_monday_projects); does not call Monday. Existing categories are left \
            unchanged. Returns the created and the existing names.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn import_monday_categories(&self) -> CallToolResult {
        self.call_single(IMPORT_MONDAY_CATEGORIES, json!({})).await
    }

    #[tool(
        name = "read_monday_catalogs",
        description = "Read the label catalogs (Activity Type, Project Stage, Non Billable \
            reason, Report Type) from the Monday time report board and keep them in the app, \
            like the Catalogs \"Read\" button in Integrations → Monday. They seed \
            import_monday_categories. Returns the four lists.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn read_monday_catalogs(&self) -> CallToolResult {
        self.call_single(READ_MONDAY_CATALOGS, json!({})).await
    }
    #[tool(
        name = "list_clockify_entries",
        description = "List the time entries already in Clockify for the user, in the \
            configured Clockify workspace, like the app's Clockify entries dialog: grouped \
            by local day (most recent first) with each entry's description, start/end \
            (UTC), duration, billable, project and tags. The running entry is left out. By \
            default only entries with all the default tags are listed when default tags are \
            configured (`hiddenByTags` true = there were entries, none with those tags; call \
            again with onlyDefaultTags false). Errors if Clockify is not configured. Reads \
            Clockify; changes nothing.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn list_clockify_entries(
        &self,
        Parameters(args): Parameters<ListClockifyEntriesArgs>,
    ) -> CallToolResult {
        // Em texto, como a query string chega ao TS.
        let only_default_tags = args.only_default_tags.map(|v| v.to_string());
        self.call_single(
            LIST_CLOCKIFY_ENTRIES,
            json!({ "from": args.from, "to": args.to, "onlyDefaultTags": only_default_tags }),
        )
        .await
    }

    #[tool(
        name = "list_monday_entries",
        description = "List the user's activities already sent to Monday (only theirs, on the \
            boards linked to DeskClock projects) that overlap a window, like the app's Monday \
            activities dialog: grouped by start day (most recent first; `date` null = no \
            dates) with hours, billable, Activity Type, Project Stage and status. Only the \
            app's four windows exist. Errors if Monday is not connected or no project has a \
            board. Reads Monday; changes nothing.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn list_monday_entries(
        &self,
        Parameters(args): Parameters<ListMondayEntriesArgs>,
    ) -> CallToolResult {
        self.call_single(LIST_MONDAY_ENTRIES, json!({ "period": args.period }))
            .await
    }

    #[tool(
        name = "list_day_summaries",
        description = "Read the AI day summaries already generated for a period, from the \
            app's local storage (no call to the AI provider), most recent first; a day \
            without a summary is absent. Today's summary, if stored, may be outdated — \
            generate_day_summaries regenerates it. Errors if no AI provider is configured.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_day_summaries(
        &self,
        Parameters(args): Parameters<ListDaySummariesArgs>,
    ) -> CallToolResult {
        self.call_single(
            LIST_DAY_SUMMARIES,
            json!({ "from": args.from, "to": args.to, "workspaceId": args.workspace_id }),
        )
        .await
    }

    #[tool(
        name = "generate_day_summaries",
        description = "Generate the AI summary of each workday in a period, like opening the \
            Summary tab of the app's History: one paragraph per day with finished tasks, at \
            most the 5 most recent days (`scopeNote` says when more were found). A day already \
            summarized comes from storage without calling the provider (`source: cache`); \
            today is always regenerated, since it is not over. Days run one at a time; a \
            failed day comes in `errors` with a message for the user, and on the provider's \
            rate limit the run stops and the rest come in `skipped`. Sends task names, \
            project names and durations to the user's AI provider. Can take up to a couple of \
            minutes. Errors if no AI provider is configured.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn generate_day_summaries(
        &self,
        Parameters(args): Parameters<GenerateDaySummariesArgs>,
    ) -> CallToolResult {
        self.call_single(GENERATE_DAY_SUMMARIES, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_drive_backup_status",
        description = "State of the database backup to Google Drive, as Integrations → Google \
            shows it: whether Google is connected, whether the automatic backup is on and how \
            often, the last successful backup (`lastRunAt`, ISO, null = never), the latest \
            failure and whether it needs reconnecting Google, and the Drive folder name. Reads \
            local settings only.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_drive_backup_status(&self) -> CallToolResult {
        self.call_single(GET_DRIVE_BACKUP_STATUS, json!({})).await
    }

    #[tool(
        name = "run_drive_backup",
        description = "Back up the database to Google Drive now, like the \"Back up now\" \
            button: uploads a copy of the database without the integration keys, then deletes \
            the oldest backups beyond the number the user chose to keep. Every call uploads a \
            new file. Restoring is a manual procedure outside the app, not a tool. Can take up \
            to a couple of minutes. Errors if Google is not connected, or with the message the \
            app shows when Drive fails (e.g. reconnect Google). Returns the file id and the \
            new status.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn run_drive_backup(&self) -> CallToolResult {
        self.call_single(RUN_DRIVE_BACKUP, json!({})).await
    }
    #[tool(
        name = "create_clockify_entry",
        description = "Create a time entry in Clockify, in the configured Clockify workspace, \
            like \"New entry\" in the app's Clockify entries dialog. Needs a description, a \
            Clockify project (projectId from list_clockify_entries, or its exact name as the \
            app shows it, \"Client - Project\"), the local day (YYYY-MM-DD) and start/end \
            (HH:MM, local; an end earlier than the start is the next day). Tags default to the \
            configured default tags and billable to false, as the form starts. This writes to \
            Clockify, not to DeskClock's history; to log work in DeskClock use log_past_task. \
            Every call creates another entry. Errors if Clockify is not configured or the \
            project or a tag does not exist there. Returns the entry as written.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn create_clockify_entry(
        &self,
        Parameters(args): Parameters<CreateClockifyEntryArgs>,
    ) -> CallToolResult {
        self.call_single(CREATE_CLOCKIFY_ENTRY, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "update_clockify_entry",
        description = "Edit a Clockify time entry, like saving its edit form in the app's \
            Clockify entries dialog: the entry is rewritten whole, so pass every field — \
            description, project, day, start/end (HH:MM, local), billable and the tags ([] = \
            none) — repeating the current values from list_clockify_entries for what should \
            stay (the tags there have ids and names; the project, its id; start/end there are \
            UTC, so convert them to the local time zone from get_status). Get `id` from \
            list_clockify_entries. Errors if Clockify is not configured or the project or a \
            tag does not exist there. Returns the entry as written.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn update_clockify_entry(
        &self,
        Parameters(args): Parameters<UpdateClockifyEntryArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_CLOCKIFY_ENTRY,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "delete_clockify_entry",
        description = "Permanently delete a time entry from Clockify, like the trash button \
            in the app's Clockify entries dialog. The deletion is immediate and cannot be \
            undone. Call it only when the user explicitly asked to delete that entry. Get `id` \
            from list_clockify_entries. Errors if Clockify is not configured, or with \
            Clockify's message if the entry no longer exists. Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn delete_clockify_entry(
        &self,
        Parameters(args): Parameters<ClockifyEntryIdArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_CLOCKIFY_ENTRY, json!({ "id": args.id }))
            .await
    }

    #[tool(
        name = "update_monday_entry",
        description = "Edit one of the user's activities on Monday, like the pencil in the \
            app's Monday activities dialog: name, reported hours, billable (only on boards \
            with the Billing type column), Activity Type and Project Stage (only labels the \
            board offers; an error lists them). Omitted fields keep their current value. The \
            dates cannot be edited: they come from the DeskClock task. Get `id` (the \
            `itemId`) from list_monday_entries; only the user's own activities found there can \
            be edited. Errors if Monday is not connected. Returns the activity as it is now on \
            the board.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn update_monday_entry(
        &self,
        Parameters(args): Parameters<UpdateMondayEntryArgs>,
    ) -> CallToolResult {
        self.call_single(
            UPDATE_MONDAY_ENTRY,
            json!({ "id": args.id, "body": args.body }),
        )
        .await
    }

    #[tool(
        name = "delete_monday_entry",
        description = "Permanently delete one of the user's activities from the Monday \
            board, and DeskClock's record that it was sent. The board is shared with the \
            user's team and the deletion cannot be undone from here. The app asks for \
            confirmation before deleting: call this only when the user explicitly asked to \
            delete that activity, and confirm with the user first, naming the activity, its \
            board and hours. Get `id` (the `itemId`) from list_monday_entries; only the user's \
            own activities found there can be deleted (an error otherwise, so a repeated call \
            only errors). Errors if Monday is not connected. Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn delete_monday_entry(
        &self,
        Parameters(args): Parameters<MondayEntryIdArgs>,
    ) -> CallToolResult {
        self.call_single(DELETE_MONDAY_ENTRY, json!({ "id": args.id }))
            .await
    }

    #[tool(
        name = "get_general_settings",
        description = "Read DeskClock's general settings (Settings > General): your name, start \
            with the computer, hide on focus loss, integrations rail, discard tasks under 1 \
            minute, duration rounding (enabled, slots, tolerance), daily and weekly goals, first \
            day of the week and whether the weekend is shown.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_general_settings(&self) -> CallToolResult {
        self.call_single(GET_GENERAL_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_general_settings",
        description = "Change DeskClock's general settings, like Settings > General. Pass only \
            what changes; omitted fields keep their value. Applies the same side effects as the \
            screen: startOnBoot registers or removes the app from the OS startup; weekStartsOn \
            and showWeekend update every open window. Values the screen does not offer (goals \
            out of range, a slot that is not a multiple of 5 up to 60, another tolerance) are \
            an error. Returns the whole group as it is now.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_general_settings(
        &self,
        Parameters(args): Parameters<UpdateGeneralSettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_GENERAL_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_overlay_settings",
        description = "Read the overlay settings (Settings > Overlay): opacity at rest (%) and \
            snap to grid.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_overlay_settings(&self) -> CallToolResult {
        self.call_single(GET_OVERLAY_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_overlay_settings",
        description = "Change the overlay settings, like Settings > Overlay: opacity at rest \
            (20 to 100%) and snap to grid. Omitted fields keep their value; the open overlay \
            applies the change at once. To show or hide the overlay, use toggle_overlay. \
            Returns the group as it is now.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_overlay_settings(
        &self,
        Parameters(args): Parameters<UpdateOverlaySettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_OVERLAY_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_accessibility_settings",
        description = "Read the appearance settings (Settings > Appearance): mode (escuro/claro) \
            and accent color.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_accessibility_settings(&self) -> CallToolResult {
        self.call_single(GET_ACCESSIBILITY_SETTINGS, json!({}))
            .await
    }

    #[tool(
        name = "update_accessibility_settings",
        description = "Change the appearance, like Settings > Appearance: mode (escuro = dark, \
            claro = light) and accent color. Omitted fields keep their value. The theme changes \
            in every window at once. Returns the appearance as it is now.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_accessibility_settings(
        &self,
        Parameters(args): Parameters<UpdateAccessibilitySettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_ACCESSIBILITY_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_shortcut_settings",
        description = "Read DeskClock's global keyboard shortcuts (Settings > Shortcuts): \
            start/pause/resume, stop, show/hide overlay, show/hide window. \"\" = no shortcut.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_shortcut_settings(&self) -> CallToolResult {
        self.call_single(GET_SHORTCUT_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_shortcut_settings",
        description = "Change DeskClock's keyboard shortcuts, like Settings > Shortcuts. These \
            shortcuts are GLOBAL in the operating system: they are registered at once and fire \
            in any application, even with DeskClock in the background, so a common combination \
            (e.g. CmdOrCtrl+C) would take it from every other app — confirm the combination \
            with the user. Format: modifiers CmdOrCtrl, Shift, Alt, then one key, joined by \"+\" \
            (e.g. CmdOrCtrl+Shift+P, Alt+F5); \"\" removes a shortcut; omitted ones keep their \
            value. The same combination on two actions is an error. A shortcut the OS refuses \
            (in use by another app) is still saved, as in the screen, and comes back in \
            failedShortcuts with the screen's warning; on Wayland global shortcuts do not \
            work. Returns the four shortcuts.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_shortcut_settings(
        &self,
        Parameters(args): Parameters<UpdateShortcutSettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_SHORTCUT_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "toggle_overlay",
        description = "Show or hide DeskClock's floating overlay, like the Show / Hide overlay \
            button and shortcut: shows the compact overlay when hidden, hides it (and its popup) \
            when visible. Calling it again reverts. Returns `visible`, the state after the call.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn toggle_overlay(&self) -> CallToolResult {
        self.call_single(TOGGLE_OVERLAY, json!({})).await
    }

    #[tool(
        name = "reset_window_positions",
        description = "Forget the saved positions of the main window and the overlays, like \
            \"Reset saved window positions\" in Settings > General. Call it only when the user \
            asked. Returns an empty object.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn reset_window_positions(&self) -> CallToolResult {
        self.call_single(RESET_WINDOW_POSITIONS, json!({})).await
    }

    #[tool(
        name = "get_task_share_link",
        description = "Get the deskclock://task/share link of a planned task, like \"Copy link\" \
            on its row, to send to someone else. Returns `link` and `payload`, exactly what \
            travels in it: name, project and category by name, billable, start/end time and \
            custom fields by label. Schedule, recurrence, date, actions and ids never travel. \
            Get `plannedTaskId` from list_planned_tasks.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_task_share_link(
        &self,
        Parameters(args): Parameters<GetTaskShareLinkArgs>,
    ) -> CallToolResult {
        self.call_single(GET_TASK_SHARE_LINK, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "preview_shared_task",
        description = "Read a deskclock://task/share link someone sent, like the \"Task received \
            by link\" dialog, without saving anything: the task matched against this workspace's \
            projects, categories and custom fields, what did not match (`unresolved`, nothing \
            is created) and, when a task is active, the warning that starting this one ends it. \
            Show it to the user before calling accept_shared_task. Only task/share links are \
            read; an invalid link is an error with the app's message.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn preview_shared_task(
        &self,
        Parameters(args): Parameters<PreviewSharedTaskArgs>,
    ) -> CallToolResult {
        self.call_single(PREVIEW_SHARED_TASK, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "accept_shared_task",
        description = "Act on a deskclock://task/share link, like the two buttons of the \
            \"Task received by link\" dialog: `plan` adds it as a planned task on one date \
            (`date`, default today; never recurring), `start` starts it now — which ends the \
            active task, if any, by the normal stop rules (call preview_shared_task first and \
            tell the user). Saves what the link matched; to change name, project or the rest, \
            edit afterwards with update_planned_task or update_running_task. Every call \
            creates another planned task or starts again.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn accept_shared_task(
        &self,
        Parameters(args): Parameters<AcceptSharedTaskArgs>,
    ) -> CallToolResult {
        self.call_single(ACCEPT_SHARED_TASK, json!({ "body": args }))
            .await
    }

    // ---------------- Fase D3b: ajustes das integrações ----------------

    #[tool(
        name = "get_sheets_settings",
        description = "Read the Google Sheets settings (Integrations > Google > Google Sheets): \
            whether Google is connected, the DeskClock workspace whose tasks are sent, \
            spreadsheet id, sheet name, the eight columns in order, duration format and \
            automatic sending. No token or account is returned.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_sheets_settings(&self) -> CallToolResult {
        self.call_single(GET_SHEETS_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_sheets_settings",
        description = "Change the Google Sheets settings, like the screen. Pass only what \
            changes; omitted fields keep their value. columnMapping is the whole list of the \
            eight columns (reorder, enable, rename) — read it first. Turning automatic sending \
            on only changes what the scheduler does next; nothing is sent by this call. Needs \
            Google connected. Returns the whole group.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_sheets_settings(
        &self,
        Parameters(args): Parameters<UpdateSheetsSettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_SHEETS_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_calendar_settings",
        description = "Read the Google Calendar settings: whether Google is connected, the \
            DeskClock workspace of the manual event import, automatic meeting tracking and the \
            ignored-event rules.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_calendar_settings(&self) -> CallToolResult {
        self.call_single(GET_CALENDAR_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_calendar_settings",
        description = "Change the Google Calendar settings: the DeskClock workspace of the \
            manual \"Import events\" (automatic meeting tracking keeps creating in the active \
            workspace, by design) and automatic meeting tracking. Ignored-event rules use \
            add_calendar_ignore_rule / remove_calendar_ignore_rule. Returns the group.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_calendar_settings(
        &self,
        Parameters(args): Parameters<UpdateCalendarSettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_CALENDAR_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "add_calendar_ignore_rule",
        description = "Add an ignored-event rule: events matching it are not tracked and come \
            unselected in the calendar import. \"Ignore always\" on an event of \
            preview_calendar_import is this with operator `equals` and the event title. A rule \
            that already exists is not duplicated (`added: false`). Returns the rules.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn add_calendar_ignore_rule(
        &self,
        Parameters(args): Parameters<CalendarIgnoreRuleArgs>,
    ) -> CallToolResult {
        self.call_single(ADD_CALENDAR_IGNORE_RULE, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "remove_calendar_ignore_rule",
        description = "Remove one ignored-event rule (same operator and name as listed by \
            get_calendar_settings), like its X on the screen. Undo is add_calendar_ignore_rule \
            with the same values. A rule that does not exist is an error. Returns the rules.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn remove_calendar_ignore_rule(
        &self,
        Parameters(args): Parameters<CalendarIgnoreRuleArgs>,
    ) -> CallToolResult {
        self.call_single(REMOVE_CALENDAR_IGNORE_RULE, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_drive_backup_settings",
        description = "Read the automatic Google Drive backup settings: whether Google is \
            connected, automatic backup on/off and frequency. Last run and last error are in \
            get_drive_backup_status.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_drive_backup_settings(&self) -> CallToolResult {
        self.call_single(GET_DRIVE_BACKUP_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_drive_backup_settings",
        description = "Turn the automatic Google Drive backup on or off and set its frequency \
            (counted from the last successful backup). The scheduler reads it at once: when on \
            and due, a backup runs in its next cycle — this call itself uploads nothing (use \
            run_drive_backup for that). Needs Google connected. Returns the group.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_drive_backup_settings(
        &self,
        Parameters(args): Parameters<UpdateDriveBackupSettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_DRIVE_BACKUP_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_clockify_settings",
        description = "Read the Clockify settings: whether it is connected, the DeskClock \
            workspace, the Clockify workspace, default tags, project and category mappings of \
            that Clockify workspace, and automatic sending. No API key is returned.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_clockify_settings(&self) -> CallToolResult {
        self.call_single(GET_CLOCKIFY_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_clockify_settings",
        description = "Change the Clockify settings: DeskClock workspace, Clockify workspace \
            (one of list_clockify_workspaces; switching changes which mappings apply, nothing \
            is deleted) and automatic sending. Omitted fields keep their value. Returns the \
            group.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_clockify_settings(
        &self,
        Parameters(args): Parameters<UpdateClockifySettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_CLOCKIFY_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "list_clockify_workspaces",
        description = "List the user's Clockify workspaces, read from Clockify now (\"Refresh \
            list\"). The list is kept as the one update_clockify_settings accepts.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn list_clockify_workspaces(&self) -> CallToolResult {
        self.call_single(LIST_CLOCKIFY_WORKSPACES, json!({})).await
    }

    #[tool(
        name = "list_clockify_catalog",
        description = "List the projects (by display name \"Client - Project\") and tags of the \
            chosen Clockify workspace, read from Clockify — the ids for the Clockify mappings.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn list_clockify_catalog(&self) -> CallToolResult {
        self.call_single(LIST_CLOCKIFY_CATALOG, json!({})).await
    }

    #[tool(
        name = "map_clockify_project",
        description = "Map a DeskClock project to a Clockify project, like picking it in the \
            Mappings list; replaces the project's previous mapping in this Clockify workspace. \
            Returns the Clockify settings.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn map_clockify_project(
        &self,
        Parameters(args): Parameters<MapClockifyProjectArgs>,
    ) -> CallToolResult {
        self.call_single(
            MAP_CLOCKIFY_PROJECT,
            json!({ "id": args.project_id, "body": { "clockifyProjectId": args.clockify_project_id } }),
        )
        .await
    }

    #[tool(
        name = "unmap_clockify_project",
        description = "Remove a DeskClock project's Clockify mapping, like the X on its row: its \
            tasks are then sent without a Clockify project. Redo with map_clockify_project (the \
            Clockify project id is in get_clockify_settings before removing). Returns an empty \
            object.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn unmap_clockify_project(
        &self,
        Parameters(args): Parameters<UnmapClockifyProjectArgs>,
    ) -> CallToolResult {
        self.call_single(UNMAP_CLOCKIFY_PROJECT, json!({ "id": args.project_id }))
            .await
    }

    #[tool(
        name = "set_clockify_category_tags",
        description = "Set the Clockify tags of a DeskClock category (the whole selection; [] \
            = none), like its tag picker. Returns the Clockify settings.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn set_clockify_category_tags(
        &self,
        Parameters(args): Parameters<SetClockifyCategoryTagsArgs>,
    ) -> CallToolResult {
        self.call_single(
            SET_CLOCKIFY_CATEGORY_TAGS,
            json!({ "id": args.category_id, "body": { "tagIds": args.tag_ids } }),
        )
        .await
    }

    #[tool(
        name = "set_clockify_default_tags",
        description = "Set the Clockify default tags, added to every entry sent regardless of \
            category (the whole selection; [] = none). Returns the Clockify settings.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn set_clockify_default_tags(
        &self,
        Parameters(args): Parameters<SetClockifyDefaultTagsArgs>,
    ) -> CallToolResult {
        self.call_single(SET_CLOCKIFY_DEFAULT_TAGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "import_clockify_projects",
        description = "\"Import from Clockify\" for projects: one DeskClock project per Clockify \
            project (by display name) in the Clockify DeskClock workspace, created when missing, \
            each mapped to its Clockify project. The project mappings of this Clockify workspace \
            are REPLACED by the imported ones: a manual mapping of a project with another name \
            is lost. Call it only when the user asked. Returns how many were read and the \
            mappings.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn import_clockify_projects(&self) -> CallToolResult {
        self.call_single(IMPORT_CLOCKIFY_PROJECTS, json!({})).await
    }

    #[tool(
        name = "import_clockify_tags",
        description = "\"Import from Clockify\" for tags: one DeskClock category (billable) per \
            Clockify tag, created when missing and mapped to the tag; a category that already \
            had tags keeps them. The category mappings of this Clockify workspace are REPLACED \
            by the imported ones: a manual mapping of a category with another name is lost. \
            Call it only when the user asked.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn import_clockify_tags(&self) -> CallToolResult {
        self.call_single(IMPORT_CLOCKIFY_TAGS, json!({})).await
    }

    #[tool(
        name = "get_monday_settings",
        description = "Read the Monday settings: whether it is connected, DeskClock workspace, \
            Portfolio and Report board ids, automatic item import, the Project Stage and Non \
            Billable reason custom fields (linked field, labels read, options missing), the \
            linked projects (with portfolioItemId and board; \"\" = no board) and automatic \
            sending. No API key is returned.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_monday_settings(&self) -> CallToolResult {
        self.call_single(GET_MONDAY_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_monday_settings",
        description = "Change the Monday settings: DeskClock workspace, board ids, automatic \
            item import, the custom field linked to Project Stage / Non Billable reason (a \
            select field from list_custom_fields, not archived; \"\" unlinks) and automatic \
            sending. Omitted fields keep their value. Returns the group.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_monday_settings(
        &self,
        Parameters(args): Parameters<UpdateMondaySettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_MONDAY_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "create_monday_catalog_field",
        description = "\"Create from Monday\" for Project Stage or Non Billable reason: creates a \
            select custom field with the board's labels (read_monday_catalogs first) and links \
            it; a select field with the same name is linked instead. Only when no field is \
            linked yet — otherwise use refresh_monday_catalog_field.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn create_monday_catalog_field(
        &self,
        Parameters(args): Parameters<MondayCatalogFieldArgs>,
    ) -> CallToolResult {
        self.call_single(
            CREATE_MONDAY_CATALOG_FIELD,
            json!({ "id": serde_json::to_value(args.field).unwrap_or(Value::Null) }),
        )
        .await
    }

    #[tool(
        name = "refresh_monday_catalog_field",
        description = "\"Refresh\" the linked Project Stage or Non Billable reason field: adds \
            the board labels it lacks as options; existing options stay (their ids are the \
            values saved in tasks). Returns how many were added.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn refresh_monday_catalog_field(
        &self,
        Parameters(args): Parameters<MondayCatalogFieldArgs>,
    ) -> CallToolResult {
        self.call_single(
            REFRESH_MONDAY_CATALOG_FIELD,
            json!({ "id": serde_json::to_value(args.field).unwrap_or(Value::Null) }),
        )
        .await
    }

    #[tool(
        name = "set_monday_project_board",
        description = "Type the board id of a Monday project whose Portfolio item has none, \
            like the field on the Projects card: reads the board schema from Monday and links \
            it; a board that does not fit the template is an error and nothing is saved. Only \
            for projects without a board (get_monday_settings). Returns the project.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn set_monday_project_board(
        &self,
        Parameters(args): Parameters<SetMondayProjectBoardArgs>,
    ) -> CallToolResult {
        self.call_single(
            SET_MONDAY_PROJECT_BOARD,
            json!({ "id": args.portfolio_item_id, "body": { "boardId": args.board_id } }),
        )
        .await
    }

    #[tool(
        name = "get_zendesk_settings",
        description = "Read the Zendesk settings: whether it is connected and the DeskClock \
            workspace where imported tickets become planned tasks. No credential is returned.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_zendesk_settings(&self) -> CallToolResult {
        self.call_single(GET_ZENDESK_SETTINGS, json!({})).await
    }

    #[tool(
        name = "update_zendesk_settings",
        description = "Change the DeskClock workspace where imported Zendesk tickets become \
            planned tasks. Subdomain and OAuth client are part of connecting and are not here.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_zendesk_settings(
        &self,
        Parameters(args): Parameters<UpdateZendeskSettingsArgs>,
    ) -> CallToolResult {
        self.call_single(UPDATE_ZENDESK_SETTINGS, json!({ "body": args }))
            .await
    }

    #[tool(
        name = "get_llm_settings",
        description = "Read the AI provider settings (read only): whether it is connected, the \
            provider preset and the model. Changing them is done in the app's connect dialog, \
            which tests the key.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_llm_settings(&self) -> CallToolResult {
        self.call_single(GET_LLM_SETTINGS, json!({})).await
    }

    #[tool(
        name = "run_integration_sync_now",
        description = "\"Send now\" of the daily automatic sending (Google Sheets or Monday; \
            Clockify has no such button): sends at once what is pending since the last send. \
            Only works with automatic sending on in daily mode. Every call sends; show the user \
            what will go before (preview_send_to_integration). Returns the count and the \
            screen's message.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn run_integration_sync_now(
        &self,
        Parameters(args): Parameters<RunIntegrationSyncNowArgs>,
    ) -> CallToolResult {
        self.call_single(
            RUN_INTEGRATION_SYNC_NOW,
            json!({ "id": serde_json::to_value(args.integration).unwrap_or(Value::Null) }),
        )
        .await
    }

    #[tool(
        name = "get_task_text_fields",
        description = "The fields a short task text can fill, as the app's \"start task by \
            text\" input shows them: Project (`P`), Category (`C`), Billable (`B`) and each \
            active custom field, with the sigla the user types before `=` (`PS=dev`), its kind \
            and an example from the workspace catalog; plus `instruction`, the line the app \
            shows above the input (name and fields in order, comma-separated). Use it to tell \
            the user what they can write. Reads local data only.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_task_text_fields(
        &self,
        Parameters(args): Parameters<WorkspaceArgs>,
    ) -> CallToolResult {
        self.call_single(GET_TASK_TEXT_FIELDS, args.params()).await
    }

    #[tool(
        name = "interpret_task_text",
        description = "Turn a short task text into task fields, like the app's \"start task \
            by text\" preview. It does NOT start, log or plan anything. A text with siglas \
            (`P=acme C=dev nb`) or positional, comma-separated in the instruction's order with \
            fields skippable (`Daily, Acme, Development, nb`), is split in the app without \
            calling the AI provider; free text goes to the user's AI provider when one is \
            connected (only the text and each field's label, sigla and kind — never the \
            catalog), and without one the whole text becomes the name. Matching to projects, categories and options is local. Returns \
            `name`, `projectId`/`projectName`, `categoryId`/`categoryName`, `billable` \
            (`billableExplicit` false = taken from the category default), `customValues` \
            (field id → stored value) with `customFields` labelled for display, \
            `ambiguities` (several candidates, up to 5) and `notFound`, and `source` (`local` \
            or `llm`). Show the result to the user and confirm every ambiguity and missing \
            value with them before acting; then call start_task, log_past_task or plan_task \
            with the returned ids and customValues.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn interpret_task_text(
        &self,
        Parameters(args): Parameters<InterpretTaskTextArgs>,
    ) -> CallToolResult {
        self.call_single(INTERPRET_TASK_TEXT, json!({ "body": args }))
            .await
    }
}

impl DeskClockMcp {
    /// Tool de uma `op` só: repassa os params e devolve o corpo como veio, ou
    /// dentro da chave da tabela.
    async fn call_single(&self, tool: &str, params: Value) -> CallToolResult {
        let [OpCall { op, key }] = ops_of(tool) else {
            unreachable!("'{tool}' chama uma op só")
        };
        match body_or_error(self.bridge.request(op, params).await) {
            Ok(body) => match key {
                Some(key) => success(json!({ *key: body })),
                // 204 sem corpo (excluir): `structuredContent` tem de ser objeto.
                None if body.is_null() => success(json!({})),
                None => success(body),
            },
            Err(error) => error,
        }
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for DeskClockMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("deskclock", app_version()))
            .with_instructions(
                "DeskClock is the user's desktop time tracker. Messages returned by tools \
                 are in Brazilian Portuguese.",
            )
    }
}

/// A versão do app é a do `tauri.conf.json`; a do `Cargo.toml` (0.1.0) nunca muda.
fn app_version() -> String {
    let conf: Value = serde_json::from_str(include_str!("../../tauri.conf.json"))
        .expect("tauri.conf.json é JSON válido");
    conf["version"]
        .as_str()
        .expect("tauri.conf.json tem `version`")
        .to_string()
}

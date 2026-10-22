//! Tools do MCP. Cada uma só mapeia nome → `op` + params e chama a ponte direto:
//! a regra fica no TS, como na API REST (`docs-internal/specs/mcp.md` §2).

use crate::api::bridge::Bridge;
use crate::mcp::ops::{
    ops_of, OpCall, CANCEL_TASK, COMPLETE_PLANNED_TASK, CREATE_CUSTOM_FIELD, DELETE_CUSTOM_FIELD,
    DELETE_PLANNED_TASK, DUPLICATE_PLANNED_TASK, GET_STATUS, GET_TOTALS, GET_WEEK_TOTALS,
    LIST_CATALOG, LIST_CUSTOM_FIELDS, LIST_PLANNED_TASKS, LIST_TASKS, LOG_PAST_TASK,
    LOG_PLANNED_TASK, PAUSE_TASK, PLAN_TASK, RESUME_TASK, START_PLANNED_TASK, START_TASK,
    STOP_TASK, UNCOMPLETE_PLANNED_TASK, UPDATE_CUSTOM_FIELD, UPDATE_PLANNED_TASK,
    UPDATE_RUNNING_TASK, UPDATE_TASK,
};
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

#[derive(Clone)]
pub struct DeskClockMcp {
    bridge: Arc<Bridge>,
    tool_router: ToolRouter<Self>,
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
            fields are not included: use list_custom_fields.",
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

//! Tools do MCP. Cada uma só mapeia nome → `op` + params e chama a ponte direto:
//! a regra fica no TS, como na API REST (`docs-internal/specs/mcp.md` §2).

use crate::api::bridge::Bridge;
use crate::mcp::ops::{
    ops_of, OpCall, GET_STATUS, GET_TOTALS, GET_WEEK_TOTALS, LIST_CATALOG, LIST_PLANNED_TASKS,
    LIST_TASKS, LOG_PAST_TASK, LOG_PLANNED_TASK, PAUSE_TASK, PLAN_TASK, RESUME_TASK,
    START_PLANNED_TASK, START_TASK, STOP_TASK,
};
use crate::mcp::result::{body_or_error, success};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Implementation, ServerCapabilities, ServerConfig},
    schemars, tool, tool_handler, tool_router, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
pub struct StartPlannedTaskArgs {
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
            carry `defaultBillable`, the billable value a task gets by default in them.",
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
        Parameters(args): Parameters<StartPlannedTaskArgs>,
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

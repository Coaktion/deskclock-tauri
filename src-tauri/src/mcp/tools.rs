//! Tools do MCP. Cada uma só mapeia nome → `op` + params e chama a ponte direto:
//! a regra fica no TS, como na API REST (`docs-internal/specs/mcp.md` §2).

use crate::api::bridge::Bridge;
use crate::mcp::ops::{
    ops_of, OpCall, GET_STATUS, LIST_CATALOG, LIST_PLANNED_TASKS, PAUSE_TASK, RESUME_TASK,
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

// Os corpos vão ao TS como o cliente mandou, como no repasse da REST: campo
// omitido fica ausente, e o TS trata ausente e `null` do mesmo jeito.
#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskArgs {
    /// Task name (free text). Optional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
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
            `id` (for start_planned_task), `name`, `projectName`, `categoryName`, \
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

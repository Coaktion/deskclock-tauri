//! Tabela única tool → `op` da ponte. As tools leem daqui as `op` que chamam, e o
//! teste confere a tabela contra `mcp-ops.json` — é o que faz a trava de cobertura
//! (`docs-internal/specs/mcp.md` §4) valer para o código de verdade.

pub const GET_STATUS: &str = "get_status";
pub const LIST_CATALOG: &str = "list_catalog";
pub const START_TASK: &str = "start_task";
pub const PAUSE_TASK: &str = "pause_task";
pub const RESUME_TASK: &str = "resume_task";
pub const STOP_TASK: &str = "stop_task";
pub const START_PLANNED_TASK: &str = "start_planned_task";
pub const LIST_PLANNED_TASKS: &str = "list_planned_tasks";
pub const PLAN_TASK: &str = "plan_task";
pub const LOG_PAST_TASK: &str = "log_past_task";
pub const LOG_PLANNED_TASK: &str = "log_planned_task";
pub const LIST_TASKS: &str = "list_tasks";
pub const GET_TOTALS: &str = "get_totals";
pub const GET_WEEK_TOTALS: &str = "get_week_totals";
pub const LIST_CUSTOM_FIELDS: &str = "list_custom_fields";
pub const CREATE_CUSTOM_FIELD: &str = "create_custom_field";
pub const UPDATE_CUSTOM_FIELD: &str = "update_custom_field";
pub const DELETE_CUSTOM_FIELD: &str = "delete_custom_field";
pub const UPDATE_RUNNING_TASK: &str = "update_running_task";
pub const UPDATE_TASK: &str = "update_task";
pub const UPDATE_PLANNED_TASK: &str = "update_planned_task";
pub const COMPLETE_PLANNED_TASK: &str = "complete_planned_task";
pub const UNCOMPLETE_PLANNED_TASK: &str = "uncomplete_planned_task";
pub const DUPLICATE_PLANNED_TASK: &str = "duplicate_planned_task";
pub const DELETE_PLANNED_TASK: &str = "delete_planned_task";
pub const CANCEL_TASK: &str = "cancel_task";
pub const DELETE_TASK: &str = "delete_task";
pub const DELETE_TASKS: &str = "delete_tasks";
pub const SET_TASK_BILLABLE: &str = "set_task_billable";
pub const MERGE_TASKS: &str = "merge_tasks";
pub const MOVE_TASKS_TO_WORKSPACE: &str = "move_tasks_to_workspace";
pub const CREATE_PROJECT: &str = "create_project";
pub const UPDATE_PROJECT: &str = "update_project";
pub const DELETE_PROJECT: &str = "delete_project";
pub const IMPORT_PROJECTS: &str = "import_projects";
pub const DELETE_PROJECTS: &str = "delete_projects";
pub const CREATE_CATEGORY: &str = "create_category";
pub const UPDATE_CATEGORY: &str = "update_category";
pub const DELETE_CATEGORY: &str = "delete_category";
pub const IMPORT_CATEGORIES: &str = "import_categories";
pub const DELETE_CATEGORIES: &str = "delete_categories";
pub const LIST_PROJECT_CATEGORIES: &str = "list_project_categories";
pub const SET_PROJECT_CATEGORIES: &str = "set_project_categories";
pub const CREATE_WORKSPACE: &str = "create_workspace";
pub const UPDATE_WORKSPACE: &str = "update_workspace";
pub const DELETE_WORKSPACE: &str = "delete_workspace";
pub const SET_ACTIVE_WORKSPACE: &str = "set_active_workspace";
pub const PREVIEW_SEND_TO_INTEGRATION: &str = "preview_send_to_integration";
pub const SEND_TASKS_TO_INTEGRATION: &str = "send_tasks_to_integration";
pub const LIST_EXPORT_PROFILES: &str = "list_export_profiles";
pub const CREATE_EXPORT_PROFILE: &str = "create_export_profile";
pub const UPDATE_EXPORT_PROFILE: &str = "update_export_profile";
pub const DELETE_EXPORT_PROFILE: &str = "delete_export_profile";
pub const SET_DEFAULT_EXPORT_PROFILE: &str = "set_default_export_profile";
pub const EXPORT_TASKS: &str = "export_tasks";

pub const PREVIEW_CALENDAR_IMPORT: &str = "preview_calendar_import";
pub const IMPORT_CALENDAR_EVENTS: &str = "import_calendar_events";
pub const PREVIEW_ZENDESK_IMPORT: &str = "preview_zendesk_import";
pub const IMPORT_ZENDESK_TICKETS: &str = "import_zendesk_tickets";
pub const PREVIEW_MONDAY_IMPORT: &str = "preview_monday_import";
pub const IMPORT_MONDAY_ITEMS: &str = "import_monday_items";
pub const IMPORT_MONDAY_PROJECTS: &str = "import_monday_projects";
pub const IMPORT_MONDAY_CATEGORIES: &str = "import_monday_categories";
pub const READ_MONDAY_CATALOGS: &str = "read_monday_catalogs";

pub const OP_STATUS: &str = "status.get";
pub const OP_WORKSPACES: &str = "workspaces.list";
pub const OP_PROJECTS: &str = "projects.list";
pub const OP_CATEGORIES: &str = "categories.list";
pub const OP_START: &str = "tasks.start";
pub const OP_PAUSE: &str = "tasks.pause";
pub const OP_RESUME: &str = "tasks.resume";
pub const OP_STOP: &str = "tasks.stop";
pub const OP_START_PLANNED: &str = "tasks.startPlanned";
pub const OP_PLANNED_LIST: &str = "plannedTasks.list";
pub const OP_PLANNED_CREATE: &str = "plannedTasks.create";
pub const OP_HISTORY_CREATE: &str = "history.create";
pub const OP_LAUNCH_RETROACTIVE: &str = "plannedTasks.launchRetroactive";
pub const OP_HISTORY_LIST: &str = "history.list";
pub const OP_TOTALS_PERIOD: &str = "totals.period";
pub const OP_TOTALS_WEEK: &str = "totals.week";
pub const OP_CUSTOM_FIELDS_LIST: &str = "customFields.list";
pub const OP_CUSTOM_FIELDS_CREATE: &str = "customFields.create";
pub const OP_CUSTOM_FIELDS_UPDATE: &str = "customFields.update";
pub const OP_CUSTOM_FIELDS_DELETE: &str = "customFields.delete";
pub const OP_UPDATE_ACTIVE: &str = "tasks.updateActive";
pub const OP_HISTORY_UPDATE: &str = "history.update";
pub const OP_PLANNED_PATCH: &str = "plannedTasks.patch";
pub const OP_PLANNED_COMPLETE: &str = "plannedTasks.complete";
pub const OP_PLANNED_UNCOMPLETE: &str = "plannedTasks.uncomplete";
pub const OP_PLANNED_DUPLICATE: &str = "plannedTasks.duplicate";
pub const OP_PLANNED_DELETE: &str = "plannedTasks.delete";
pub const OP_CANCEL: &str = "tasks.cancel";
pub const OP_HISTORY_DELETE: &str = "history.delete";
pub const OP_HISTORY_DELETE_MANY: &str = "history.deleteMany";
pub const OP_HISTORY_SET_BILLABLE: &str = "history.setBillable";
pub const OP_HISTORY_MERGE: &str = "history.merge";
pub const OP_HISTORY_MOVE: &str = "history.move";
pub const OP_PROJECTS_CREATE: &str = "projects.create";
pub const OP_PROJECTS_UPDATE: &str = "projects.update";
pub const OP_PROJECTS_DELETE: &str = "projects.delete";
pub const OP_PROJECTS_IMPORT: &str = "projects.import";
pub const OP_PROJECTS_DELETE_MANY: &str = "projects.deleteMany";
pub const OP_CATEGORIES_CREATE: &str = "categories.create";
pub const OP_CATEGORIES_UPDATE: &str = "categories.update";
pub const OP_CATEGORIES_DELETE: &str = "categories.delete";
pub const OP_CATEGORIES_IMPORT: &str = "categories.import";
pub const OP_CATEGORIES_DELETE_MANY: &str = "categories.deleteMany";
pub const OP_PROJECT_CATEGORIES_LIST: &str = "projectCategories.list";
pub const OP_PROJECT_CATEGORIES_SET: &str = "projectCategories.set";
pub const OP_WORKSPACES_CREATE: &str = "workspaces.create";
pub const OP_WORKSPACES_UPDATE: &str = "workspaces.update";
pub const OP_WORKSPACES_DELETE: &str = "workspaces.delete";
pub const OP_WORKSPACES_SET_ACTIVE: &str = "workspaces.setActive";
pub const OP_INTEGRATIONS_SEND_PREVIEW: &str = "integrations.sendPreview";
pub const OP_INTEGRATIONS_SEND: &str = "integrations.send";
pub const OP_EXPORT_PROFILES_LIST: &str = "exportProfiles.list";
pub const OP_EXPORT_PROFILES_CREATE: &str = "exportProfiles.create";
pub const OP_EXPORT_PROFILES_UPDATE: &str = "exportProfiles.update";
pub const OP_EXPORT_PROFILES_DELETE: &str = "exportProfiles.delete";
pub const OP_EXPORT_PROFILES_SET_DEFAULT: &str = "exportProfiles.setDefault";
pub const OP_EXPORT_GENERATE: &str = "export.generate";
pub const OP_CALENDAR_IMPORT_PREVIEW: &str = "calendar.importPreview";
pub const OP_CALENDAR_IMPORT: &str = "calendar.import";
pub const OP_ZENDESK_IMPORT_PREVIEW: &str = "zendesk.importPreview";
pub const OP_ZENDESK_IMPORT: &str = "zendesk.import";
pub const OP_MONDAY_IMPORT_PREVIEW: &str = "monday.importPreview";
pub const OP_MONDAY_IMPORT: &str = "monday.import";
pub const OP_MONDAY_IMPORT_PROJECTS: &str = "monday.importProjects";
pub const OP_MONDAY_IMPORT_CATEGORIES: &str = "monday.importCategories";
pub const OP_MONDAY_READ_CATALOGS: &str = "monday.readCatalogs";

/// Uma chamada à ponte. `key` é onde a resposta entra no resultado da tool; `None`
/// quando a tool devolve o corpo da `op` como veio.
pub struct OpCall {
    pub op: &'static str,
    pub key: Option<&'static str>,
}

const fn pass_through(op: &'static str) -> OpCall {
    OpCall { op, key: None }
}

const fn under(key: &'static str, op: &'static str) -> OpCall {
    OpCall { op, key: Some(key) }
}

pub const TOOL_OPS: &[(&str, &[OpCall])] = &[
    (GET_STATUS, &[pass_through(OP_STATUS)]),
    (
        LIST_CATALOG,
        &[
            under("workspaces", OP_WORKSPACES),
            under("projects", OP_PROJECTS),
            under("categories", OP_CATEGORIES),
        ],
    ),
    (START_TASK, &[pass_through(OP_START)]),
    (PAUSE_TASK, &[pass_through(OP_PAUSE)]),
    (RESUME_TASK, &[pass_through(OP_RESUME)]),
    // O descarte (< 1 min) responde 204 sem corpo: embrulhar dá sempre um objeto,
    // com `task: null` para o descarte, em vez de um `structuredContent` nulo.
    (STOP_TASK, &[under("task", OP_STOP)]),
    (START_PLANNED_TASK, &[pass_through(OP_START_PLANNED)]),
    // `structuredContent` tem de ser objeto; a lista vai numa chave.
    (
        LIST_PLANNED_TASKS,
        &[under("plannedTasks", OP_PLANNED_LIST)],
    ),
    (PLAN_TASK, &[pass_through(OP_PLANNED_CREATE)]),
    (LOG_PAST_TASK, &[pass_through(OP_HISTORY_CREATE)]),
    (LOG_PLANNED_TASK, &[pass_through(OP_LAUNCH_RETROACTIVE)]),
    (LIST_TASKS, &[under("tasks", OP_HISTORY_LIST)]),
    // Uma tool por `op`, em vez de uma que escolhe a `op` pelos argumentos: a
    // tool só mapeia, e a escolha entre período e semana fica explícita no nome.
    (GET_TOTALS, &[pass_through(OP_TOTALS_PERIOD)]),
    (GET_WEEK_TOTALS, &[pass_through(OP_TOTALS_WEEK)]),
    // A lista vai numa chave: `structuredContent` tem de ser objeto.
    (
        LIST_CUSTOM_FIELDS,
        &[under("customFields", OP_CUSTOM_FIELDS_LIST)],
    ),
    (
        CREATE_CUSTOM_FIELD,
        &[pass_through(OP_CUSTOM_FIELDS_CREATE)],
    ),
    (
        UPDATE_CUSTOM_FIELD,
        &[pass_through(OP_CUSTOM_FIELDS_UPDATE)],
    ),
    // O TS responde 204 sem corpo: `call_single` devolve `{}` para corpo nulo.
    (
        DELETE_CUSTOM_FIELD,
        &[pass_through(OP_CUSTOM_FIELDS_DELETE)],
    ),
    // Edição parcial: o corpo vai como o cliente mandou, ausente e `null` distintos.
    (UPDATE_RUNNING_TASK, &[pass_through(OP_UPDATE_ACTIVE)]),
    (UPDATE_TASK, &[pass_through(OP_HISTORY_UPDATE)]),
    (UPDATE_PLANNED_TASK, &[pass_through(OP_PLANNED_PATCH)]),
    (COMPLETE_PLANNED_TASK, &[pass_through(OP_PLANNED_COMPLETE)]),
    (
        UNCOMPLETE_PLANNED_TASK,
        &[pass_through(OP_PLANNED_UNCOMPLETE)],
    ),
    (
        DUPLICATE_PLANNED_TASK,
        &[pass_through(OP_PLANNED_DUPLICATE)],
    ),
    // As duas respondem 204 sem corpo: `call_single` devolve `{}`.
    (DELETE_PLANNED_TASK, &[pass_through(OP_PLANNED_DELETE)]),
    (CANCEL_TASK, &[pass_through(OP_CANCEL)]),
    // Fase B da paridade. As exclusões (uma e em lote) respondem 204 sem corpo:
    // `call_single` devolve `{}`.
    (DELETE_TASK, &[pass_through(OP_HISTORY_DELETE)]),
    (DELETE_TASKS, &[pass_through(OP_HISTORY_DELETE_MANY)]),
    (SET_TASK_BILLABLE, &[pass_through(OP_HISTORY_SET_BILLABLE)]),
    (MERGE_TASKS, &[pass_through(OP_HISTORY_MERGE)]),
    (MOVE_TASKS_TO_WORKSPACE, &[pass_through(OP_HISTORY_MOVE)]),
    (CREATE_PROJECT, &[pass_through(OP_PROJECTS_CREATE)]),
    (UPDATE_PROJECT, &[pass_through(OP_PROJECTS_UPDATE)]),
    (DELETE_PROJECT, &[pass_through(OP_PROJECTS_DELETE)]),
    (IMPORT_PROJECTS, &[pass_through(OP_PROJECTS_IMPORT)]),
    (DELETE_PROJECTS, &[pass_through(OP_PROJECTS_DELETE_MANY)]),
    (CREATE_CATEGORY, &[pass_through(OP_CATEGORIES_CREATE)]),
    (UPDATE_CATEGORY, &[pass_through(OP_CATEGORIES_UPDATE)]),
    (DELETE_CATEGORY, &[pass_through(OP_CATEGORIES_DELETE)]),
    (IMPORT_CATEGORIES, &[pass_through(OP_CATEGORIES_IMPORT)]),
    (
        DELETE_CATEGORIES,
        &[pass_through(OP_CATEGORIES_DELETE_MANY)],
    ),
    // As duas devolvem a lista de associações: vai numa chave.
    (
        LIST_PROJECT_CATEGORIES,
        &[under("projectCategories", OP_PROJECT_CATEGORIES_LIST)],
    ),
    (
        SET_PROJECT_CATEGORIES,
        &[under("projectCategories", OP_PROJECT_CATEGORIES_SET)],
    ),
    (CREATE_WORKSPACE, &[pass_through(OP_WORKSPACES_CREATE)]),
    (UPDATE_WORKSPACE, &[pass_through(OP_WORKSPACES_UPDATE)]),
    (DELETE_WORKSPACE, &[pass_through(OP_WORKSPACES_DELETE)]),
    (
        SET_ACTIVE_WORKSPACE,
        &[pass_through(OP_WORKSPACES_SET_ACTIVE)],
    ),
    // Fase C1 da paridade: envio às integrações, prévia antes.
    (
        PREVIEW_SEND_TO_INTEGRATION,
        &[pass_through(OP_INTEGRATIONS_SEND_PREVIEW)],
    ),
    (
        SEND_TASKS_TO_INTEGRATION,
        &[pass_through(OP_INTEGRATIONS_SEND)],
    ),
    // Fase C2 da paridade: perfis de exportação e o conteúdo gerado.
    (
        LIST_EXPORT_PROFILES,
        &[under("exportProfiles", OP_EXPORT_PROFILES_LIST)],
    ),
    (
        CREATE_EXPORT_PROFILE,
        &[pass_through(OP_EXPORT_PROFILES_CREATE)],
    ),
    (
        UPDATE_EXPORT_PROFILE,
        &[pass_through(OP_EXPORT_PROFILES_UPDATE)],
    ),
    (
        DELETE_EXPORT_PROFILE,
        &[pass_through(OP_EXPORT_PROFILES_DELETE)],
    ),
    (
        SET_DEFAULT_EXPORT_PROFILE,
        &[pass_through(OP_EXPORT_PROFILES_SET_DEFAULT)],
    ),
    (EXPORT_TASKS, &[pass_through(OP_EXPORT_GENERATE)]),
    // Fase D1 da paridade: imports das integrações, prévia antes onde a tela seleciona.
    (
        PREVIEW_CALENDAR_IMPORT,
        &[pass_through(OP_CALENDAR_IMPORT_PREVIEW)],
    ),
    (IMPORT_CALENDAR_EVENTS, &[pass_through(OP_CALENDAR_IMPORT)]),
    (
        PREVIEW_ZENDESK_IMPORT,
        &[pass_through(OP_ZENDESK_IMPORT_PREVIEW)],
    ),
    (IMPORT_ZENDESK_TICKETS, &[pass_through(OP_ZENDESK_IMPORT)]),
    (
        PREVIEW_MONDAY_IMPORT,
        &[pass_through(OP_MONDAY_IMPORT_PREVIEW)],
    ),
    (IMPORT_MONDAY_ITEMS, &[pass_through(OP_MONDAY_IMPORT)]),
    (
        IMPORT_MONDAY_PROJECTS,
        &[pass_through(OP_MONDAY_IMPORT_PROJECTS)],
    ),
    (
        IMPORT_MONDAY_CATEGORIES,
        &[pass_through(OP_MONDAY_IMPORT_CATEGORIES)],
    ),
    (
        READ_MONDAY_CATALOGS,
        &[pass_through(OP_MONDAY_READ_CATALOGS)],
    ),
];

pub fn ops_of(tool: &str) -> &'static [OpCall] {
    TOOL_OPS
        .iter()
        .find(|(name, _)| *name == tool)
        .map(|(_, calls)| *calls)
        .unwrap_or_else(|| panic!("tool '{tool}' fora de TOOL_OPS"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::collections::BTreeMap;

    fn exposed() -> BTreeMap<String, String> {
        let manifest: Value = serde_json::from_str(include_str!("../../mcp-ops.json")).unwrap();
        serde_json::from_value(manifest["exposed"].clone()).unwrap()
    }

    #[test]
    fn toda_op_chamada_por_tool_esta_em_exposed_com_o_nome_da_tool() {
        let exposed = exposed();
        for (tool, calls) in TOOL_OPS {
            for OpCall { op, .. } in *calls {
                assert_eq!(
                    exposed.get(*op).map(String::as_str),
                    Some(*tool),
                    "'{op}' é chamada pela tool '{tool}' mas não está em `exposed` de \
                     src-tauri/mcp-ops.json com esse nome"
                );
            }
        }
    }

    #[test]
    fn toda_entrada_de_exposed_tem_tool() {
        for (op, tool) in exposed() {
            let covered = TOOL_OPS
                .iter()
                .any(|(t, calls)| *t == tool && calls.iter().any(|c| c.op == op));
            assert!(
                covered,
                "'{op}' está em `exposed` de src-tauri/mcp-ops.json como '{tool}', \
                 mas nenhuma tool de TOOL_OPS a chama"
            );
        }
    }
}

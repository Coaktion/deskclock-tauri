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

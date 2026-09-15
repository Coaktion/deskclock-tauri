import { errorResult, toErrorResult } from "./errors";
import {
  createCategoryHandler,
  createProjectHandler,
  deleteCategoryHandler,
  deleteManyCategories,
  deleteManyProjects,
  deleteProjectHandler,
  importCategories,
  importProjects,
  listCategories,
  listProjects,
  updateCategoryHandler,
  updateProjectHandler,
} from "./handlers/catalog";
import {
  createCustomFieldHandler,
  deleteCustomFieldHandler,
  listCustomFields,
  updateCustomFieldHandler,
} from "./handlers/customFields";
import {
  completePlannedTask,
  createPlannedTaskHandler,
  deletePlannedTask,
  duplicatePlannedTaskHandler,
  getPlannedTask,
  launchPlannedTaskRetroactiveHandler,
  listPlannedTasks,
  startPlannedTaskHandler,
  uncompletePlannedTask,
  updatePlannedTaskHandler,
} from "./handlers/plannedTasks";
import {
  createHistoryTask,
  deleteHistoryTask,
  getHistoryTask,
  listHistory,
  setHistoryTaskBillable,
  updateHistoryTask,
} from "./handlers/history";
import {
  deleteManyHistoryTasks,
  mergeHistoryTasks,
  moveHistoryTasks,
} from "./handlers/historyBatch";
import { getPeriodTotals, getWeekTotals } from "./handlers/totals";
import { listProjectCategories, setProjectCategories } from "./handlers/projectCategories";
import {
  cancelTask,
  getStatus,
  pauseTask,
  resumeTask,
  startTask,
  stopTask,
  toggleTask,
  updateActiveTaskHandler,
} from "./handlers/tasks";
import {
  createWorkspaceHandler,
  deleteWorkspaceHandler,
  getActiveWorkspace,
  listWorkspaces,
  setActiveWorkspace,
  updateWorkspaceHandler,
} from "./handlers/workspaces";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams, LocalApiResult } from "./types";

/** As chaves são as `op` que `src-tauri/src/api/handlers.rs` e seus submódulos emitem. */
const HANDLERS: Record<string, LocalApiHandler> = {
  "status.get": getStatus,
  "tasks.start": startTask,
  "tasks.pause": pauseTask,
  "tasks.resume": resumeTask,
  "tasks.stop": stopTask,
  "tasks.toggle": toggleTask,
  "tasks.cancel": cancelTask,
  "tasks.updateActive": updateActiveTaskHandler,
  // `tasks.*` de propósito: inicia a tarefa em execução, então espera o render.
  "tasks.startPlanned": startPlannedTaskHandler,
  // Registros concluídos: `history.*` e não `tasks.*`, porque não mexem na
  // tarefa em execução e não devem esperar o render (`waitsForNextCommit`).
  "history.list": listHistory,
  "history.get": getHistoryTask,
  "history.create": createHistoryTask,
  "history.update": updateHistoryTask,
  "history.delete": deleteHistoryTask,
  "history.deleteMany": deleteManyHistoryTasks,
  "history.setBillable": setHistoryTaskBillable,
  "history.merge": mergeHistoryTasks,
  "history.move": moveHistoryTasks,
  "totals.period": getPeriodTotals,
  "totals.week": getWeekTotals,
  "workspaces.list": listWorkspaces,
  "workspaces.create": createWorkspaceHandler,
  "workspaces.update": updateWorkspaceHandler,
  "workspaces.delete": deleteWorkspaceHandler,
  "workspaces.getActive": getActiveWorkspace,
  "workspaces.setActive": setActiveWorkspace,
  "projects.list": listProjects,
  "projects.create": createProjectHandler,
  "projects.update": updateProjectHandler,
  "projects.delete": deleteProjectHandler,
  "projects.import": importProjects,
  "projects.deleteMany": deleteManyProjects,
  "projectCategories.list": listProjectCategories,
  "projectCategories.set": setProjectCategories,
  "categories.list": listCategories,
  "categories.create": createCategoryHandler,
  "categories.update": updateCategoryHandler,
  "categories.delete": deleteCategoryHandler,
  "categories.import": importCategories,
  "categories.deleteMany": deleteManyCategories,
  "customFields.list": listCustomFields,
  "customFields.create": createCustomFieldHandler,
  "customFields.update": updateCustomFieldHandler,
  "customFields.delete": deleteCustomFieldHandler,
  "plannedTasks.list": listPlannedTasks,
  "plannedTasks.get": getPlannedTask,
  "plannedTasks.create": createPlannedTaskHandler,
  "plannedTasks.update": updatePlannedTaskHandler,
  "plannedTasks.delete": deletePlannedTask,
  "plannedTasks.complete": completePlannedTask,
  "plannedTasks.uncomplete": uncompletePlannedTask,
  "plannedTasks.duplicate": duplicatePlannedTaskHandler,
  "plannedTasks.launchRetroactive": launchPlannedTaskRetroactiveHandler,
};

/** Nunca rejeita: todo erro vira status, porque o Rust aguarda uma resposta. */
export async function dispatchLocalApiRequest(
  deps: LocalApiDeps,
  op: string,
  params: LocalApiParams | null | undefined
): Promise<LocalApiResult> {
  const handler = HANDLERS[op];
  if (!handler) return errorResult(404, `Operação desconhecida: '${op}'`);
  try {
    return await handler(deps, params ?? {});
  } catch (error) {
    return toErrorResult(error);
  }
}

const WORKSPACE_MUTATIONS = new Set([
  "workspaces.create",
  "workspaces.update",
  "workspaces.delete",
  "workspaces.setActive",
]);

/**
 * Ops que mudam o que o retrato lê de contexto — a tarefa em execução, o
 * workspace ativo ou a lista de workspaces. A próxima requisição precisa
 * esperar o render.
 */
export function waitsForNextCommit(op: string): boolean {
  return op.startsWith("tasks.") || WORKSPACE_MUTATIONS.has(op);
}

import { errorResult, toErrorResult } from "./errors";
import { listCategories, listProjects } from "./handlers/catalog";
import {
  completePlannedTask,
  createPlannedTaskHandler,
  deletePlannedTask,
  getPlannedTask,
  listPlannedTasks,
  uncompletePlannedTask,
  updatePlannedTaskHandler,
} from "./handlers/plannedTasks";
import {
  cancelTask,
  getStatus,
  pauseTask,
  resumeTask,
  startTask,
  stopTask,
  toggleTask,
} from "./handlers/tasks";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams, LocalApiResult } from "./types";

/** As chaves são as `op` que `src-tauri/src/api/handlers.rs` emite. */
const HANDLERS: Record<string, LocalApiHandler> = {
  "status.get": getStatus,
  "tasks.start": startTask,
  "tasks.pause": pauseTask,
  "tasks.resume": resumeTask,
  "tasks.stop": stopTask,
  "tasks.toggle": toggleTask,
  "tasks.cancel": cancelTask,
  "projects.list": listProjects,
  "categories.list": listCategories,
  "plannedTasks.list": listPlannedTasks,
  "plannedTasks.get": getPlannedTask,
  "plannedTasks.create": createPlannedTaskHandler,
  "plannedTasks.update": updatePlannedTaskHandler,
  "plannedTasks.delete": deletePlannedTask,
  "plannedTasks.complete": completePlannedTask,
  "plannedTasks.uncomplete": uncompletePlannedTask,
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

/** Ops que mudam o `RunningTaskContext` — a próxima requisição precisa esperar o render. */
export function changesRunningTask(op: string): boolean {
  return op.startsWith("tasks.");
}

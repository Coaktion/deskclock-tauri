import type { Task } from "@domain/entities/Task";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import type { LocalApiDeps } from "./types";

/** Nomes do catálogo de um workspace, para montar vários DTOs com uma leitura só. */
export interface CatalogNames {
  projects: Map<string, string>;
  categories: Map<string, string>;
}

export async function loadCatalogNames(
  deps: LocalApiDeps,
  workspaceId: string
): Promise<CatalogNames> {
  const [projects, categories] = await Promise.all([
    deps.projectRepo.findAll(workspaceId),
    deps.categoryRepo.findAll(workspaceId),
  ]);
  return {
    projects: new Map(projects.map((p) => [p.id, p.name])),
    categories: new Map(categories.map((c) => [c.id, c.name])),
  };
}

// Nome ausente sai como `undefined`, e o JSON o omite — é o contrato antigo
// (`skip_serializing_if`) que clientes existentes conhecem.
function names(names: CatalogNames, projectId: string | null, categoryId: string | null) {
  return {
    projectName: projectId ? names.projects.get(projectId) : undefined,
    categoryName: categoryId ? names.categories.get(categoryId) : undefined,
  };
}

export function toTaskDto(task: Task, catalog: CatalogNames, nowISO: string) {
  const { projectName, categoryName } = names(catalog, task.projectId, task.categoryId);
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    name: task.name,
    projectId: task.projectId,
    projectName,
    categoryId: task.categoryId,
    categoryName,
    billable: task.billable,
    status: task.status,
    startTime: task.startTime,
    endTime: task.endTime,
    durationSeconds: task.durationSeconds,
    elapsedSeconds: effectiveDuration(task, nowISO),
    plannedTaskId: task.plannedTaskId ?? null,
    customValues: task.customValues,
  };
}

export async function taskDto(deps: LocalApiDeps, task: Task) {
  return toTaskDto(task, await loadCatalogNames(deps, task.workspaceId), deps.nowISO());
}

export function toPlannedTaskDto(task: PlannedTask, catalog: CatalogNames) {
  const { projectName, categoryName } = names(catalog, task.projectId, task.categoryId);
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    name: task.name,
    projectId: task.projectId,
    projectName,
    categoryId: task.categoryId,
    categoryName,
    billable: task.billable,
    scheduleType: task.scheduleType,
    scheduleDate: task.scheduleDate,
    recurringDays: task.recurringDays,
    periodStart: task.periodStart,
    periodEnd: task.periodEnd,
    completedDates: task.completedDates,
    actions: task.actions,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt,
    customValues: task.customValues,
    startTime: task.startTime,
    endTime: task.endTime,
  };
}

export async function plannedTaskDto(deps: LocalApiDeps, task: PlannedTask) {
  return toPlannedTaskDto(task, await loadCatalogNames(deps, task.workspaceId));
}

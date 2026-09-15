import type { Task } from "@domain/entities/Task";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { setGroupBillable } from "@domain/usecases/tasks/SetGroupBillable";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { DomainError } from "@shared/errors";
import { loadCatalogNames, taskDto, toTaskDto } from "../dto";
import { resolveCategoryId, resolveProjectId, resolveRequestWorkspace } from "../resolve";
import {
  assertNotActive,
  buildTaskEditPatch,
  findTaskOrThrow,
  parseInstant,
  secondsBetween,
  type TaskEditBody,
} from "../taskInput";
import { periodRange } from "../period";
import type { LocalApiHandler } from "../types";

interface TaskBody extends TaskEditBody {
  workspaceId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

const MIN_DURATION_SECONDS = 60;

function billableFilter(value: string | null | undefined): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new DomainError("billable deve ser 'true' ou 'false'");
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new DomainError("billable deve ser true ou false");
  return value;
}

export const listHistory: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const { startISO, endISO } = periodRange(deps, params);
  const billable = billableFilter(params.billable);
  const [projectId, categoryId] = await Promise.all([
    params.projectId ? resolveProjectId(deps, workspaceId, params.projectId, null) : undefined,
    params.categoryId ? resolveCategoryId(deps, workspaceId, params.categoryId, null) : undefined,
  ]);
  const tasks = await searchTasks(deps.taskRepo, {
    startISO,
    endISO,
    name: params.name || undefined,
    projectId: projectId ?? undefined,
    categoryId: categoryId ?? undefined,
    billable,
    workspaceId,
  });
  const catalog = await loadCatalogNames(deps, workspaceId);
  const nowISO = deps.nowISO();
  return {
    status: 200,
    body: tasks
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
      .map((t) => toTaskDto(t, catalog, nowISO)),
  };
};

export const getHistoryTask: LocalApiHandler = async (deps, params) => ({
  status: 200,
  body: await taskDto(deps, await findTaskOrThrow(deps, params.id)),
});

export const createHistoryTask: LocalApiHandler = async (deps, params) => {
  const body = params.body as TaskBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const billable = requireBoolean(body.billable);
  const startTime = parseInstant(body.startTime, "startTime");
  const endTime = parseInstant(body.endTime, "endTime");
  const durationSeconds = secondsBetween(startTime, endTime);
  // Mesma trava do Lançamento Manual (`useRetroactiveForm`).
  if (durationSeconds < MIN_DURATION_SECONDS) {
    throw new DomainError("A duração mínima é 1 minuto.");
  }
  const [projectId, categoryId] = await Promise.all([
    resolveProjectId(deps, workspaceId, body.projectId, body.projectName),
    resolveCategoryId(deps, workspaceId, body.categoryId, body.categoryName),
  ]);
  const task = await createRetroactiveTask(
    deps.taskRepo,
    {
      workspaceId,
      name: body.name?.trim() || null,
      projectId,
      categoryId,
      billable,
      startTime,
      endTime,
      durationSeconds,
      customValues: body.customValues ?? undefined,
    },
    deps.nowISO()
  );
  await deps.notifyTasksChanged();
  return { status: 201, body: await taskDto(deps, task) };
};

// Tarefa concluída sempre tem intervalo: `null` não limpa, é erro de formato.
function intervalPatch(task: Task, body: TaskBody) {
  if (body.startTime === undefined && body.endTime === undefined) return {};
  if (body.startTime === null || body.endTime === null) {
    throw new DomainError("startTime e endTime não aceitam null em tarefa concluída");
  }
  const startTime = parseInstant(body.startTime ?? task.startTime, "startTime");
  const endTime = parseInstant(body.endTime ?? task.endTime, "endTime");
  const durationSeconds = secondsBetween(startTime, endTime);
  if (durationSeconds < 0) throw new DomainError("endTime não pode ser anterior a startTime");
  return { startTime, endTime, durationSeconds };
}

export const updateHistoryTask: LocalApiHandler = async (deps, params) => {
  const task = await findTaskOrThrow(deps, params.id);
  assertNotActive(task);
  const body = (params.body ?? {}) as TaskBody;
  const input = {
    ...(await buildTaskEditPatch(deps, task, body)),
    ...intervalPatch(task, body),
  };
  const nowISO = deps.nowISO();
  const updated = await updateTask(deps.taskRepo, task.id, input, nowISO);
  // Igual ao `EditTaskModal`: faturamento é do grupo (§6.2), inclusive do grupo
  // novo quando a edição mudou a chave. Grupo uniforme não gera escrita.
  await setGroupBillable(deps.taskRepo, updated, updated.billable, nowISO);
  await deps.notifyTasksChanged();
  return { status: 200, body: await taskDto(deps, updated) };
};

export const deleteHistoryTask: LocalApiHandler = async (deps, params) => {
  const task = await findTaskOrThrow(deps, params.id);
  assertNotActive(task);
  await deleteTask(deps.taskRepo, task.id);
  await deps.notifyTasksChanged();
  return { status: 204, body: null };
};

export const setHistoryTaskBillable: LocalApiHandler = async (deps, params) => {
  const task = await findTaskOrThrow(deps, params.id);
  assertNotActive(task);
  const { billable } = (params.body ?? {}) as { billable?: unknown };
  await setGroupBillable(deps.taskRepo, task, requireBoolean(billable), deps.nowISO());
  await deps.notifyTasksChanged();
  return { status: 200, body: await taskDto(deps, await findTaskOrThrow(deps, task.id)) };
};

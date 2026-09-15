import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import { ConflictError, NotFoundError } from "../errors";
import { loadCatalogNames, taskDto, toTaskDto } from "../dto";
import { resolveCategoryId, resolveProjectId, resolveRequestWorkspace } from "../resolve";
import type { LocalApiDeps, LocalApiHandler } from "../types";

// O envio automático depende de rede e passaria do prazo de 10s da ponte: a
// resposta sai com o registro final gravado e o envio segue em segundo plano.
const STOP_OPTIONS = { syncInBackground: true } as const;

interface StartBody {
  workspaceId?: string | null;
  name?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  billable?: boolean | null;
  customValues?: CustomValues | null;
}

export function computeTodayTotals(tasks: Task[], nowISO: string) {
  let billableSeconds = 0;
  let nonBillableSeconds = 0;
  for (const task of tasks) {
    const seconds = Math.max(0, effectiveDuration(task, nowISO));
    if (task.billable) billableSeconds += seconds;
    else nonBillableSeconds += seconds;
  }
  return {
    totalSeconds: billableSeconds + nonBillableSeconds,
    billableSeconds,
    nonBillableSeconds,
    taskCount: tasks.length,
  };
}

export const getStatus: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const nowISO = deps.nowISO();
  const todayTasks = await getTasksForDate(deps.taskRepo, deps.todayISO(), workspaceId);
  const active = deps.running.runningTask;
  return {
    status: 200,
    body: {
      running: active?.status === "running",
      // A tarefa ativa é global — só existe uma, seja qual for o workspace dela.
      task: active
        ? toTaskDto(active, await loadCatalogNames(deps, active.workspaceId), nowISO)
        : null,
      today: computeTodayTotals(todayTasks, nowISO),
    },
  };
};

async function startFromBody(deps: LocalApiDeps, body: StartBody, billableDefault?: boolean) {
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const [projectId, categoryId] = await Promise.all([
    resolveProjectId(deps, workspaceId, body.projectId, body.projectName),
    resolveCategoryId(deps, workspaceId, body.categoryId, body.categoryName),
  ]);
  // `switchToTask` conclui a ativa pelas regras de parada — é a semântica que o
  // `start` da API sempre teve, agora sem pular descarte, arredondamento e envio.
  const task = await deps.running.switchToTask(
    {
      workspaceId,
      name: body.name ?? null,
      projectId,
      categoryId,
      billable: body.billable ?? billableDefault ?? true,
      customValues: body.customValues ?? undefined,
    },
    STOP_OPTIONS
  );
  if (!task) throw new ConflictError("Outra tarefa está sendo iniciada — tente novamente");
  return taskDto(deps, task);
}

export const startTask: LocalApiHandler = async (deps, params) => ({
  status: 201,
  body: await startFromBody(deps, (params.body ?? {}) as StartBody),
});

export const pauseTask: LocalApiHandler = async (deps) => {
  const active = deps.running.runningTask;
  if (!active) throw new NotFoundError("Nenhuma tarefa em execução");
  // 404 e não 409 no estado errado: é o contrato que a API já publicava.
  if (active.status !== "running") throw new NotFoundError("Tarefa ativa não está em execução");
  const paused = await deps.running.pauseTask();
  if (!paused) throw new NotFoundError("Nenhuma tarefa em execução");
  return { status: 200, body: await taskDto(deps, paused) };
};

export const resumeTask: LocalApiHandler = async (deps) => {
  const active = deps.running.runningTask;
  if (!active) throw new NotFoundError("Nenhuma tarefa pausada");
  // 404 e não 409 no estado errado: é o contrato que a API já publicava.
  if (active.status !== "paused") throw new NotFoundError("Tarefa ativa não está pausada");
  const resumed = await deps.running.resumeTask();
  if (!resumed) throw new NotFoundError("Nenhuma tarefa pausada");
  return { status: 200, body: await taskDto(deps, resumed) };
};

export const stopTask: LocalApiHandler = async (deps, params) => {
  if (!deps.running.runningTask) throw new NotFoundError("Nenhuma tarefa ativa");
  const body = (params.body ?? {}) as { completed?: boolean | null };
  const finalTask = await deps.running.stopTask(body.completed ?? true, undefined, STOP_OPTIONS);
  // null com tarefa ativa na entrada = descartada por durar menos de 1 minuto.
  if (!finalTask) return { status: 204, body: null };
  return { status: 200, body: await taskDto(deps, finalTask) };
};

export const toggleTask: LocalApiHandler = async (deps, params) => {
  const active = deps.running.runningTask;
  if (active?.status === "running") return pauseTask(deps, params);
  if (active?.status === "paused") return resumeTask(deps, params);
  return { status: 200, body: await startFromBody(deps, (params.body ?? {}) as StartBody, true) };
};

export const cancelTask: LocalApiHandler = async (deps) => {
  if (!deps.running.runningTask) throw new NotFoundError("Nenhuma tarefa ativa");
  await deps.running.cancelTask();
  return { status: 204, body: null };
};

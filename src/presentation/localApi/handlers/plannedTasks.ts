import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { CustomValues } from "@domain/entities/CustomField";
import { createPlannedTask } from "@domain/usecases/plannedTasks/CreatePlannedTask";
import { updatePlannedTask } from "@domain/usecases/plannedTasks/UpdatePlannedTask";
import { deletePlannedTask as deletePlannedTaskUC } from "@domain/usecases/plannedTasks/DeletePlannedTask";
import { completePlannedTask as completePlannedTaskUC } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { uncompletePlannedTask as uncompletePlannedTaskUC } from "@domain/usecases/plannedTasks/UncompletePlannedTask";
import { duplicatePlannedTask as duplicatePlannedTaskUC } from "@domain/usecases/plannedTasks/DuplicatePlannedTask";
import { getPlannedTasksForDate } from "@domain/usecases/plannedTasks/GetPlannedTasksForDate";
import { getPlannedTasksForWeek } from "@domain/usecases/plannedTasks/GetPlannedTasksForWeek";
import { launchPlannedTaskRetroactively } from "@domain/usecases/tasks/LaunchPlannedTaskRetroactively";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { DomainError } from "@shared/errors";
import { localDateISO } from "@shared/utils/time";
import { ConflictError, NotFoundError } from "../errors";
import { loadCatalogNames, plannedTaskDto, taskDto, toPlannedTaskDto } from "../dto";
import { assertDate } from "../period";
import { resolveCategoryId, resolveProjectId, resolveRequestWorkspace } from "../resolve";
import { parseInstant, secondsBetween } from "../taskInput";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams } from "../types";

interface PlannedTaskBody {
  workspaceId?: string | null;
  name: string;
  projectId?: string | null;
  projectName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  billable?: boolean | null;
  scheduleType: string;
  scheduleDate?: string | null;
  recurringDays?: number[] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  actions?: PlannedTaskAction[] | null;
  sortOrder?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  customValues?: CustomValues | null;
}

interface LaunchRetroactiveBody {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

const SCHEDULE_TYPES: ScheduleType[] = ["specific_date", "recurring", "period"];
const ACTION_TYPES: PlannedTaskAction["type"][] = ["open_url", "open_file"];
// Mesma trava do Lançamento Manual (`useRetroactiveForm`).
const MIN_DURATION_SECONDS = 60;
// Ordem padrão do domínio (`CreatePlannedTask`): a UI não reordena, então as
// listas saem na ordem de criação.
const DEFAULT_SORT_ORDER = 0;

function scheduleType(value: string): ScheduleType {
  if (!SCHEDULE_TYPES.includes(value as ScheduleType)) {
    throw new DomainError(`scheduleType inválido: '${value}'. Use ${SCHEDULE_TYPES.join(", ")}`);
  }
  return value as ScheduleType;
}

function actions(value: PlannedTaskAction[] | null | undefined): PlannedTaskAction[] {
  return (value ?? []).map((action) => {
    if (!ACTION_TYPES.includes(action.type)) {
      throw new DomainError(
        `Tipo de ação inválido: '${action.type}'. Use ${ACTION_TYPES.join(", ")}`
      );
    }
    return action.label === undefined || action.label === null
      ? { type: action.type, value: action.value }
      : { type: action.type, value: action.value, label: action.label };
  });
}

async function findOrThrow(deps: LocalApiDeps, id: string | undefined): Promise<PlannedTask> {
  const task = id ? await deps.plannedTaskRepo.findById(id) : null;
  if (!task) throw new NotFoundError(`Tarefa planejada '${id}' não encontrada`);
  return task;
}

async function resolveCatalog(deps: LocalApiDeps, workspaceId: string, body: PlannedTaskBody) {
  const [projectId, categoryId] = await Promise.all([
    resolveProjectId(deps, workspaceId, body.projectId, body.projectName),
    resolveCategoryId(deps, workspaceId, body.categoryId, body.categoryName),
  ]);
  return { projectId, categoryId };
}

/** `date` = um dia (regra do domínio); `from`/`to` = o que pode ocorrer no período; nada = todas. */
async function loadForListing(deps: LocalApiDeps, params: LocalApiParams, workspaceId: string) {
  const hasPeriod = Boolean(params.from || params.to);
  if (params.date && hasPeriod) throw new DomainError("Use date ou from/to, não os dois");
  if (params.date) {
    assertDate(params.date, "date");
    return getPlannedTasksForDate(deps.plannedTaskRepo, params.date, workspaceId);
  }
  if (!hasPeriod) return deps.plannedTaskRepo.findAll(workspaceId);
  const from = params.from || (params.to as string);
  const to = params.to || from;
  assertDate(from, "from");
  assertDate(to, "to");
  if (from > to) throw new DomainError("from não pode ser posterior a to");
  return getPlannedTasksForWeek(deps.plannedTaskRepo, from, to, workspaceId);
}

export const listPlannedTasks: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const tasks = await loadForListing(deps, params, workspaceId);
  const catalog = await loadCatalogNames(deps, workspaceId);
  return { status: 200, body: tasks.map((t) => toPlannedTaskDto(t, catalog)) };
};

export const getPlannedTask: LocalApiHandler = async (deps, params) => ({
  status: 200,
  body: await plannedTaskDto(deps, await findOrThrow(deps, params.id)),
});

export const createPlannedTaskHandler: LocalApiHandler = async (deps, params) => {
  const body = params.body as PlannedTaskBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const { projectId, categoryId } = await resolveCatalog(deps, workspaceId, body);
  const task = await createPlannedTask(
    deps.plannedTaskRepo,
    {
      workspaceId,
      name: body.name,
      projectId,
      categoryId,
      billable: body.billable ?? true,
      scheduleType: scheduleType(body.scheduleType),
      scheduleDate: body.scheduleDate ?? null,
      recurringDays: body.recurringDays ?? null,
      periodStart: body.periodStart ?? null,
      periodEnd: body.periodEnd ?? null,
      actions: actions(body.actions),
      sortOrder: body.sortOrder ?? DEFAULT_SORT_ORDER,
      startTime: body.startTime ?? undefined,
      endTime: body.endTime ?? undefined,
      customValues: body.customValues ?? {},
    },
    deps.nowISO()
  );
  await deps.notifyPlannedTasksChanged();
  return { status: 201, body: await plannedTaskDto(deps, task) };
};

// Campo ausente preserva; `null` explícito remove. Sem essa distinção, editar
// pela API uma planejada importada apagava o horário dela (defeito 6 da spec).
function keepUnlessSent<K extends "startTime" | "endTime" | "customValues">(
  body: PlannedTaskBody,
  existing: PlannedTask,
  key: K,
  cleared: PlannedTask[K]
): PlannedTask[K] {
  if (!(key in body)) return existing[key];
  return (body[key] ?? cleared) as PlannedTask[K];
}

export const updatePlannedTaskHandler: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const body = params.body as PlannedTaskBody;
  const { projectId, categoryId } = await resolveCatalog(deps, existing.workspaceId, body);
  const updated = await updatePlannedTask(deps.plannedTaskRepo, existing.id, {
    name: body.name,
    projectId,
    categoryId,
    billable: body.billable ?? existing.billable,
    scheduleType: scheduleType(body.scheduleType),
    scheduleDate: body.scheduleDate ?? null,
    recurringDays: body.recurringDays ?? null,
    periodStart: body.periodStart ?? null,
    periodEnd: body.periodEnd ?? null,
    actions: actions(body.actions),
    sortOrder: body.sortOrder ?? existing.sortOrder,
    startTime: keepUnlessSent(body, existing, "startTime", undefined),
    endTime: keepUnlessSent(body, existing, "endTime", undefined),
    customValues: keepUnlessSent(body, existing, "customValues", {}),
  });
  await deps.notifyPlannedTasksChanged();
  return { status: 200, body: await plannedTaskDto(deps, updated) };
};

export const deletePlannedTask: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  await deletePlannedTaskUC(deps.plannedTaskRepo, existing.id);
  await deps.notifyPlannedTasksChanged();
  return { status: 204, body: null };
};

export const completePlannedTask: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const date = (params.body as { date?: string | null } | null)?.date ?? deps.todayISO();
  assertDate(date, "date");
  await completePlannedTaskUC(deps.plannedTaskRepo, existing.id, date);
  await deps.notifyPlannedTasksChanged();
  return { status: 200, body: await plannedTaskDto(deps, await findOrThrow(deps, existing.id)) };
};

export const uncompletePlannedTask: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const date = params.date ?? "";
  assertDate(date, "date");
  await uncompletePlannedTaskUC(deps.plannedTaskRepo, existing.id, date);
  await deps.notifyPlannedTasksChanged();
  return { status: 200, body: await plannedTaskDto(deps, await findOrThrow(deps, existing.id)) };
};

/** Como o botão Duplicar do Planejamento: cópia sem as conclusões. */
export const duplicatePlannedTaskHandler: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const copy = await duplicatePlannedTaskUC(deps.plannedTaskRepo, existing.id, deps.nowISO());
  await deps.notifyPlannedTasksChanged();
  return { status: 201, body: await plannedTaskDto(deps, copy) };
};

/**
 * O Play das telas: `startTask` do contexto, que não faz nada com tarefa ativa —
 * por isso 409 aqui, e não a troca do `POST /tasks/start`. O vínculo
 * `plannedTaskId` é o que conclui a planejada ao parar.
 */
export const startPlannedTaskHandler: LocalApiHandler = async (deps, params) => {
  const planned = await findOrThrow(deps, params.id);
  if (deps.running.runningTask) {
    throw new ConflictError(
      "Já existe uma tarefa em execução ou pausada. Pare-a antes (POST /tasks/stop)."
    );
  }
  const task = await deps.running.startTask({
    workspaceId: planned.workspaceId,
    name: planned.name,
    projectId: planned.projectId,
    categoryId: planned.categoryId,
    billable: planned.billable,
    plannedTaskId: planned.id,
    customValues: planned.customValues,
  });
  if (!task) throw new ConflictError("Outra tarefa está sendo iniciada — tente novamente");
  return { status: 201, body: await taskDto(deps, task) };
};

async function launchDate(deps: LocalApiDeps, planned: PlannedTask, body: LaunchRetroactiveBody) {
  const date = body.date ?? deps.todayISO();
  assertDate(date, "date");
  // A tela não navega além de hoje.
  if (date > deps.todayISO()) throw new DomainError("date não pode estar no futuro");
  // A tela só oferece as planejadas do dia ainda pendentes.
  const scheduled = await getPlannedTasksForDate(deps.plannedTaskRepo, date, planned.workspaceId);
  if (!scheduled.some((t) => t.id === planned.id)) {
    throw new ConflictError(`A tarefa planejada '${planned.id}' não está agendada para ${date}`);
  }
  if (planned.completedDates.includes(date)) {
    throw new ConflictError(`A tarefa planejada '${planned.id}' já foi concluída em ${date}`);
  }
  return date;
}

/** Caminho do formulário da tela: a planejada sem horário só pré-preenche, o horário vem do usuário. */
async function launchUntimed(
  deps: LocalApiDeps,
  planned: PlannedTask,
  body: LaunchRetroactiveBody,
  date: string
) {
  if (!body.startTime || !body.endTime) {
    throw new DomainError("Planejada sem horário: informe startTime e endTime");
  }
  const startTime = parseInstant(body.startTime, "startTime");
  const endTime = parseInstant(body.endTime, "endTime");
  // O formulário monta o início no dia escolhido; o fim pode cruzar a meia-noite.
  if (localDateISO(startTime) !== date) {
    throw new DomainError(`startTime deve estar no dia ${date}`);
  }
  const durationSeconds = secondsBetween(startTime, endTime);
  if (durationSeconds < MIN_DURATION_SECONDS) {
    throw new DomainError("A duração mínima é 1 minuto.");
  }
  const task = await createRetroactiveTask(
    deps.taskRepo,
    {
      workspaceId: planned.workspaceId,
      name: planned.name || null,
      projectId: planned.projectId,
      categoryId: planned.categoryId,
      billable: planned.billable,
      startTime,
      endTime,
      durationSeconds,
      customValues: { ...planned.customValues },
    },
    deps.nowISO()
  );
  await completePlannedTaskUC(deps.plannedTaskRepo, planned.id, date);
  return task;
}

export const launchPlannedTaskRetroactiveHandler: LocalApiHandler = async (deps, params) => {
  const planned = await findOrThrow(deps, params.id);
  const body = (params.body ?? {}) as LaunchRetroactiveBody;
  const date = await launchDate(deps, planned, body);
  let task;
  if (planned.startTime && planned.endTime) {
    if (body.startTime || body.endTime) {
      throw new DomainError("A planejada já tem horário: não envie startTime nem endTime");
    }
    task = await launchPlannedTaskRetroactively(
      deps.taskRepo,
      deps.plannedTaskRepo,
      planned,
      date,
      deps.nowISO()
    );
  } else {
    task = await launchUntimed(deps, planned, body, date);
  }
  await deps.notifyTasksChanged();
  await deps.notifyPlannedTasksChanged();
  return { status: 201, body: await taskDto(deps, task) };
};

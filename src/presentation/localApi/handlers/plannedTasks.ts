import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { CustomValues } from "@domain/entities/CustomField";
import { createPlannedTask } from "@domain/usecases/plannedTasks/CreatePlannedTask";
import { updatePlannedTask } from "@domain/usecases/plannedTasks/UpdatePlannedTask";
import { deletePlannedTask as deletePlannedTaskUC } from "@domain/usecases/plannedTasks/DeletePlannedTask";
import { completePlannedTask as completePlannedTaskUC } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { uncompletePlannedTask as uncompletePlannedTaskUC } from "@domain/usecases/plannedTasks/UncompletePlannedTask";
import { getPlannedTasksForDate } from "@domain/usecases/plannedTasks/GetPlannedTasksForDate";
import { getPlannedTasksForWeek } from "@domain/usecases/plannedTasks/GetPlannedTasksForWeek";
import { DomainError } from "@shared/errors";
import { NotFoundError } from "../errors";
import { loadCatalogNames, plannedTaskDto, toPlannedTaskDto } from "../dto";
import { resolveCategoryId, resolveProjectId, resolveRequestWorkspace } from "../resolve";
import type { LocalApiDeps, LocalApiHandler } from "../types";

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

const SCHEDULE_TYPES: ScheduleType[] = ["specific_date", "recurring", "period"];
const ACTION_TYPES: PlannedTaskAction["type"][] = ["open_url", "open_file"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// O repositório não tem "todas": a janela da semana com limites extremos é o
// mesmo filtro por workspace, sem abrir um método novo só para a API.
const ALL_DAYS = ["0000-01-01", "9999-12-31"] as const;

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

function assertDate(date: string) {
  if (!DATE_PATTERN.test(date)) throw new DomainError("A data deve estar no formato YYYY-MM-DD");
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

export const listPlannedTasks: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  if (params.date) assertDate(params.date);
  const tasks = params.date
    ? await getPlannedTasksForDate(deps.plannedTaskRepo, params.date, workspaceId)
    : await getPlannedTasksForWeek(deps.plannedTaskRepo, ...ALL_DAYS, workspaceId);
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
  let sortOrder = body.sortOrder;
  if (sortOrder === undefined || sortOrder === null) {
    const existing = await getPlannedTasksForWeek(deps.plannedTaskRepo, ...ALL_DAYS, workspaceId);
    sortOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1) + 1;
  }
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
      sortOrder,
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
  assertDate(date);
  await completePlannedTaskUC(deps.plannedTaskRepo, existing.id, date);
  await deps.notifyPlannedTasksChanged();
  return { status: 200, body: await plannedTaskDto(deps, await findOrThrow(deps, existing.id)) };
};

export const uncompletePlannedTask: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const date = params.date ?? "";
  assertDate(date);
  await uncompletePlannedTaskUC(deps.plannedTaskRepo, existing.id, date);
  await deps.notifyPlannedTasksChanged();
  return { status: 200, body: await plannedTaskDto(deps, await findOrThrow(deps, existing.id)) };
};

import { vi } from "vitest";
import type { Task } from "@domain/entities/Task";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { LocalApiDeps, RunningTaskOps } from "@presentation/localApi/types";
import { localISO } from "../../helpers/localTime";

export const WS_ATIVO = "ws-ativo";
export const WS_OUTRO = "ws-outro";
export const NOW = localISO(2026, 9, 15, 10);
export const TODAY = "2026-09-15";

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    workspaceId: WS_ATIVO,
    name: "Tarefa",
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 9, 15, 9),
    endTime: null,
    durationSeconds: 0,
    status: "running",
    createdAt: localISO(2026, 9, 15, 9),
    updatedAt: localISO(2026, 9, 15, 9),
    plannedTaskId: null,
    customValues: {},
    ...overrides,
  };
}

export function makePlanned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "p-1",
    workspaceId: WS_ATIVO,
    name: "Planejada",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: TODAY,
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: localISO(2026, 9, 1, 8),
    customValues: {},
    ...overrides,
  };
}

export function makeDeps(overrides: { running?: Partial<RunningTaskOps> } = {}) {
  const taskRepo = {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    findLastDayWithCompletedTasks: vi.fn(async () => null),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  } satisfies Record<keyof ITaskRepository, unknown>;

  const plannedTaskRepo = {
    save: vi.fn(async (_task: PlannedTask) => {}),
    update: vi.fn(async (_task: PlannedTask) => {}),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    uncomplete: vi.fn(async () => {}),
    reorder: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } satisfies Record<keyof IPlannedTaskRepository, unknown>;

  const projectRepo = {
    findAll: vi.fn(async () => [
      { id: "proj-ativo", workspaceId: WS_ATIVO, name: "Cliente", colorIndex: 0 },
    ]),
    findByName: vi.fn(async (name: string, ws: string) =>
      name === "Cliente" && ws === WS_ATIVO
        ? { id: "proj-ativo", workspaceId: WS_ATIVO, name: "Cliente", colorIndex: 0 }
        : null
    ),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  } satisfies Record<keyof IProjectRepository, unknown>;

  const categoryRepo = {
    findAll: vi.fn(async () => [
      { id: "cat-ativo", workspaceId: WS_ATIVO, name: "Reuniões", defaultBillable: false },
    ]),
    findByName: vi.fn(async (name: string, ws: string) =>
      name === "Reuniões" && ws === WS_ATIVO
        ? { id: "cat-ativo", workspaceId: WS_ATIVO, name: "Reuniões", defaultBillable: false }
        : null
    ),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  } satisfies Record<keyof ICategoryRepository, unknown>;

  const workspaceRepo = {
    findAll: vi.fn(async () => []),
    findById: vi.fn(async (id: string) =>
      [WS_ATIVO, WS_OUTRO].includes(id) ? { id, name: id, color: "slot-1", createdAt: NOW } : null
    ),
    findByName: vi.fn(async () => null),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } satisfies Record<keyof IWorkspaceRepository, unknown>;

  const running = {
    runningTask: null,
    startTask: vi.fn(async () => null),
    switchToTask: vi.fn(async () => null),
    pauseTask: vi.fn(async (): Promise<Task | null> => null),
    resumeTask: vi.fn(async (): Promise<Task | null> => null),
    stopTask: vi.fn(async () => null),
    cancelTask: vi.fn(async () => {}),
    ...overrides.running,
  };

  const deps = {
    taskRepo,
    plannedTaskRepo,
    projectRepo,
    categoryRepo,
    workspaceRepo,
    activeWorkspaceId: WS_ATIVO,
    running,
    notifyPlannedTasksChanged: vi.fn(async () => {}),
    nowISO: () => NOW,
    todayISO: () => TODAY,
  };

  return deps as typeof deps & LocalApiDeps;
}

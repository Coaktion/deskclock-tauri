import { describe, it, expect, vi } from "vitest";
import { startPlannedTask } from "@domain/usecases/plannedTasks/StartPlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

function makePlannedRepo(overrides: Partial<IPlannedTaskRepository> = {}): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeTaskRepo(overrides: Partial<ITaskRepository> = {}): ITaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makePlannedTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    name: "Reunião",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    ...overrides,
  };
}

const NOW = "2026-04-08T10:00:00.000Z";

describe("startPlannedTask", () => {
  it("lança erro quando tarefa planejada não existe", async () => {
    const plannedRepo = makePlannedRepo({ findById: vi.fn(async () => null) });
    const taskRepo = makeTaskRepo();
    await expect(startPlannedTask(plannedRepo, taskRepo, "inexistente", NOW)).rejects.toThrow();
  });

  it("cria Task com dados da PlannedTask", async () => {
    const planned = makePlannedTask();
    const plannedRepo = makePlannedRepo({ findById: vi.fn(async () => planned) });
    const taskRepo = makeTaskRepo();
    const task = await startPlannedTask(plannedRepo, taskRepo, "pt1", NOW);
    expect(task.name).toBe("Reunião");
    expect(task.projectId).toBe("p1");
    expect(task.categoryId).toBe("c1");
    expect(task.billable).toBe(true);
    expect(task.status).toBe("running");
  });

  it("para qualquer tarefa ativa antes de iniciar", async () => {
    const planned = makePlannedTask();
    const plannedRepo = makePlannedRepo({ findById: vi.fn(async () => planned) });
    const runningTask = {
      id: "old",
      name: null,
      projectId: null,
      categoryId: null,
      billable: true,
      startTime: NOW,
      endTime: null,
      durationSeconds: 0,
      status: "running" as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const taskRepo = makeTaskRepo({ findByStatus: vi.fn(async () => [runningTask]) });
    await startPlannedTask(plannedRepo, taskRepo, "pt1", NOW);
    expect(taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "old", status: "completed" })
    );
  });

  it("salva nova task no repositório", async () => {
    const planned = makePlannedTask();
    const plannedRepo = makePlannedRepo({ findById: vi.fn(async () => planned) });
    const taskRepo = makeTaskRepo();
    const task = await startPlannedTask(plannedRepo, taskRepo, "pt1", NOW);
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });
});

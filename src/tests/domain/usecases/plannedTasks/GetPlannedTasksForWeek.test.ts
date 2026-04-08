import { describe, it, expect, vi } from "vitest";
import { getPlannedTasksForWeek } from "@domain/usecases/plannedTasks/GetPlannedTasksForWeek";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

function makeRepo(overrides: Partial<IPlannedTaskRepository> = {}): IPlannedTaskRepository {
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

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    name: "Tarefa",
    projectId: null,
    categoryId: null,
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

describe("getPlannedTasksForWeek", () => {
  it("delega ao repo.findForWeek com start e end", async () => {
    const tasks = [makeTask()];
    const repo = makeRepo({ findForWeek: vi.fn(async () => tasks) });
    const result = await getPlannedTasksForWeek(repo, "2026-04-06", "2026-04-12");
    expect(repo.findForWeek).toHaveBeenCalledWith("2026-04-06", "2026-04-12");
    expect(result).toEqual(tasks);
  });
});

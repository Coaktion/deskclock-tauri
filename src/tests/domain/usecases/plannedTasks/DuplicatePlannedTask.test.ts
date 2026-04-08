import { describe, it, expect, vi } from "vitest";
import { duplicatePlannedTask } from "@domain/usecases/plannedTasks/DuplicatePlannedTask";
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
    name: "Original",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: ["2026-04-07"],
    actions: [{ type: "open_url", value: "https://example.com" }],
    sortOrder: 2,
    createdAt: "2026-04-08T09:00:00.000Z",
    ...overrides,
  };
}

const NOW = "2026-04-08T10:00:00.000Z";

describe("duplicatePlannedTask", () => {
  it("lança erro quando tarefa não existe", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    await expect(duplicatePlannedTask(repo, "inexistente", NOW)).rejects.toThrow();
  });

  it("cria cópia com novo id", async () => {
    const original = makeTask();
    const repo = makeRepo({ findById: vi.fn(async () => original) });
    const copy = await duplicatePlannedTask(repo, "pt1", NOW);
    expect(copy.id).not.toBe("pt1");
    expect(repo.save).toHaveBeenCalledWith(copy);
  });

  it("copia campos de dados mas reseta completedDates", async () => {
    const original = makeTask();
    const repo = makeRepo({ findById: vi.fn(async () => original) });
    const copy = await duplicatePlannedTask(repo, "pt1", NOW);
    expect(copy.name).toBe("Original");
    expect(copy.projectId).toBe("p1");
    expect(copy.categoryId).toBe("c1");
    expect(copy.completedDates).toEqual([]);
  });

  it("copia actions", async () => {
    const original = makeTask();
    const repo = makeRepo({ findById: vi.fn(async () => original) });
    const copy = await duplicatePlannedTask(repo, "pt1", NOW);
    expect(copy.actions).toEqual(original.actions);
  });
});

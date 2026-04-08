import { describe, it, expect, vi } from "vitest";
import { updatePlannedTask } from "@domain/usecases/plannedTasks/UpdatePlannedTask";
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

describe("updatePlannedTask", () => {
  it("atualiza campos e chama repo.update", async () => {
    const existing = makeTask();
    const repo = makeRepo({ findById: vi.fn(async () => existing) });
    const updated = await updatePlannedTask(repo, "pt1", { name: "Atualizado", billable: false });
    expect(updated.name).toBe("Atualizado");
    expect(updated.billable).toBe(false);
    expect(repo.update).toHaveBeenCalledWith(updated);
  });

  it("lança erro quando tarefa não existe", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    await expect(updatePlannedTask(repo, "inexistente", { name: "X" })).rejects.toThrow();
  });

  it("mantém campos não atualizados", async () => {
    const existing = makeTask({ projectId: "p1", sortOrder: 3 });
    const repo = makeRepo({ findById: vi.fn(async () => existing) });
    const updated = await updatePlannedTask(repo, "pt1", { name: "Novo" });
    expect(updated.projectId).toBe("p1");
    expect(updated.sortOrder).toBe(3);
  });
});

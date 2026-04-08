import { describe, it, expect, vi } from "vitest";
import { createPlannedTask } from "@domain/usecases/plannedTasks/CreatePlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";

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

const NOW = "2026-04-08T10:00:00.000Z";

describe("createPlannedTask", () => {
  it("cria tarefa com specific_date", async () => {
    const repo = makeRepo();
    const task = await createPlannedTask(
      repo,
      { name: "Reunião", scheduleType: "specific_date", scheduleDate: "2026-04-08", billable: true },
      NOW
    );
    expect(task.name).toBe("Reunião");
    expect(task.scheduleType).toBe("specific_date");
    expect(task.scheduleDate).toBe("2026-04-08");
    expect(task.id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledWith(task);
  });

  it("cria tarefa recurring com dias da semana", async () => {
    const repo = makeRepo();
    const task = await createPlannedTask(
      repo,
      { name: "Daily", scheduleType: "recurring", recurringDays: [1, 2, 3], billable: false },
      NOW
    );
    expect(task.scheduleType).toBe("recurring");
    expect(task.recurringDays).toEqual([1, 2, 3]);
    expect(task.scheduleDate).toBeNull();
  });

  it("cria tarefa com period", async () => {
    const repo = makeRepo();
    const task = await createPlannedTask(
      repo,
      {
        name: "Sprint",
        scheduleType: "period",
        periodStart: "2026-04-07",
        periodEnd: "2026-04-11",
        billable: true,
      },
      NOW
    );
    expect(task.scheduleType).toBe("period");
    expect(task.periodStart).toBe("2026-04-07");
    expect(task.periodEnd).toBe("2026-04-11");
  });

  it("inicializa completedDates vazio e actions vazio", async () => {
    const repo = makeRepo();
    const task = await createPlannedTask(
      repo,
      { name: "X", scheduleType: "specific_date", scheduleDate: "2026-04-08", billable: true },
      NOW
    );
    expect(task.completedDates).toEqual([]);
    expect(task.actions).toEqual([]);
  });

  it("aceita actions configuradas", async () => {
    const repo = makeRepo();
    const task = await createPlannedTask(
      repo,
      {
        name: "X",
        scheduleType: "specific_date",
        scheduleDate: "2026-04-08",
        billable: true,
        actions: [{ type: "open_url", value: "https://example.com" }],
      },
      NOW
    );
    expect(task.actions).toHaveLength(1);
    expect(task.actions[0].type).toBe("open_url");
  });

  it("projectId e categoryId padrão null", async () => {
    const repo = makeRepo();
    const task = await createPlannedTask(
      repo,
      { name: "X", scheduleType: "specific_date", scheduleDate: "2026-04-08", billable: true },
      NOW
    );
    expect(task.projectId).toBeNull();
    expect(task.categoryId).toBeNull();
  });
});

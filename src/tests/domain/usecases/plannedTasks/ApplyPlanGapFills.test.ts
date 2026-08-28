import { describe, expect, it, vi } from "vitest";

import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { applyPlanGapFills } from "@domain/usecases/plannedTasks/ApplyPlanGapFills";

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    workspaceId: "w1",
    name: "Alinhamento",
    projectId: null,
    categoryId: null,
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-09-02",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-28T12:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function makeRepo(tasks: PlannedTask[]): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async (id: string) => tasks.find((task) => task.id === id) ?? null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
}

describe("applyPlanGapFills", () => {
  it("grava projeto e categoria propostos", async () => {
    const repo = makeRepo([makeTask()]);

    const [updated] = await applyPlanGapFills(repo, [
      { taskId: "pt1", projectId: "p1", categoryId: "c1", customValues: {} },
    ]);

    expect(updated).toMatchObject({ projectId: "p1", categoryId: "c1" });
  });

  it("mescla os campos personalizados em vez de substituí-los", async () => {
    // Substituindo, o campo que o usuário preencheu e que não estava em lacuna
    // nenhuma seria apagado em silêncio.
    const repo = makeRepo([makeTask({ customValues: { f9: "valor antigo" } })]);

    const [updated] = await applyPlanGapFills(repo, [
      { taskId: "pt1", customValues: { f1: "o2" } },
    ]);

    expect(updated.customValues).toEqual({ f9: "valor antigo", f1: "o2" });
  });

  it("não mexe no que a proposta não trouxe", async () => {
    const repo = makeRepo([makeTask({ projectId: "p1", name: "Alinhamento" })]);

    const [updated] = await applyPlanGapFills(repo, [
      { taskId: "pt1", categoryId: "c1", customValues: {} },
    ]);

    expect(updated).toMatchObject({ projectId: "p1", name: "Alinhamento" });
  });

  it("ignora a tarefa que sumiu entre a proposta e a gravação", async () => {
    const repo = makeRepo([]);

    const updated = await applyPlanGapFills(repo, [{ taskId: "sumiu", customValues: {} }]);

    expect(updated).toEqual([]);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

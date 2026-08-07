import { describe, it, expect, vi } from "vitest";
import {
  applyRunningTaskEditToPlanned,
  toPlannedTaskEdit,
} from "@domain/usecases/plannedTasks/ApplyRunningTaskEditToPlanned";
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

function makePlanned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    workspaceId: "ws-1",
    name: "Daily",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "recurring",
    scheduleDate: null,
    recurringDays: [1, 2, 3, 4, 5],
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

describe("toPlannedTaskEdit", () => {
  it("propaga projeto, categoria, billable e campos personalizados", () => {
    const edit = toPlannedTaskEdit({
      projectId: "p1",
      categoryId: "c1",
      billable: false,
      customValues: { stage: "opt-3" },
    });
    expect(edit).toEqual({
      projectId: "p1",
      categoryId: "c1",
      billable: false,
      customValues: { stage: "opt-3" },
    });
  });

  it("não toca campo ausente na edição", () => {
    expect(toPlannedTaskEdit({ projectId: "p1" })).toEqual({ projectId: "p1" });
  });

  it("limpa projeto e categoria quando a edição os manda como null", () => {
    expect(toPlannedTaskEdit({ projectId: null, categoryId: null })).toEqual({
      projectId: null,
      categoryId: null,
    });
  });

  it("propaga o nome aparado", () => {
    expect(toPlannedTaskEdit({ name: "  Revisão  " })).toEqual({ name: "Revisão" });
  });

  it("não apaga o nome da planejada quando a tarefa fica sem nome", () => {
    expect(toPlannedTaskEdit({ name: null })).toEqual({});
    expect(toPlannedTaskEdit({ name: "   " })).toEqual({});
  });

  it("ignora startTime, que não descreve o horário planejado", () => {
    expect(toPlannedTaskEdit({ startTime: "2026-04-08T11:00:00.000Z" })).toEqual({});
  });
});

describe("applyRunningTaskEditToPlanned", () => {
  it("grava a edição na planejada de origem", async () => {
    const existing = makePlanned();
    const repo = makeRepo({ findById: vi.fn(async () => existing) });

    const updated = await applyRunningTaskEditToPlanned(repo, "pt1", {
      projectId: "p1",
      categoryId: "c1",
      billable: false,
    });

    expect(updated?.projectId).toBe("p1");
    expect(updated?.categoryId).toBe("c1");
    expect(updated?.billable).toBe(false);
    expect(repo.update).toHaveBeenCalledWith(updated);
  });

  it("preserva o agendamento e as conclusões da planejada", async () => {
    const existing = makePlanned({ completedDates: ["2026-04-07"] });
    const repo = makeRepo({ findById: vi.fn(async () => existing) });

    const updated = await applyRunningTaskEditToPlanned(repo, "pt1", { projectId: "p1" });

    expect(updated?.scheduleType).toBe("recurring");
    expect(updated?.recurringDays).toEqual([1, 2, 3, 4, 5]);
    expect(updated?.completedDates).toEqual(["2026-04-07"]);
  });

  it("não escreve quando nada da edição pertence à planejada", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => makePlanned()) });

    const updated = await applyRunningTaskEditToPlanned(repo, "pt1", {
      startTime: "2026-04-08T11:00:00.000Z",
    });

    expect(updated).toBeNull();
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("não lança quando a planejada já não existe", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });

    const updated = await applyRunningTaskEditToPlanned(repo, "apagada", { projectId: "p1" });

    expect(updated).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });
});

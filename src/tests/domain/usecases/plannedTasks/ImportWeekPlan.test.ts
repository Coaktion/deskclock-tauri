import { describe, expect, it, vi } from "vitest";

import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { WeekPlanDraft } from "@domain/usecases/llm/PlanWeek";
import { importWeekPlan } from "@domain/usecases/plannedTasks/ImportWeekPlan";

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

function makeDraft(overrides: Partial<WeekPlanDraft> = {}): WeekPlanDraft {
  return {
    name: "Alinhamento",
    projectId: null,
    categoryId: null,
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-09-02",
    recurringDays: null,
    ...overrides,
  };
}

const NOW = "2026-08-28T13:00:00.000Z";

describe("importWeekPlan", () => {
  it("não salva nada com lista vazia", async () => {
    const repo = makeRepo();
    const created = await importWeekPlan(repo, [], NOW, "ws-1");
    expect(created).toHaveLength(0);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("cria uma planejada por rascunho, na ordem das entradas", async () => {
    const repo = makeRepo();

    const created = await importWeekPlan(
      repo,
      [makeDraft({ name: "Primeira" }), makeDraft({ name: "Segunda" })],
      NOW,
      "ws-1"
    );

    expect(created.map((task) => task.name)).toEqual(["Primeira", "Segunda"]);
    expect(repo.save).toHaveBeenCalledTimes(2);
  });

  it("leva projeto, categoria e faturamento já revisados", async () => {
    const repo = makeRepo();

    const [created] = await importWeekPlan(
      repo,
      [makeDraft({ projectId: "p1", categoryId: "c1", billable: true })],
      NOW,
      "ws-1"
    );

    expect(created).toMatchObject({ projectId: "p1", categoryId: "c1", billable: true });
  });

  it("cria a tarefa de dia único com a data, e sem recorrência", async () => {
    const repo = makeRepo();

    const [created] = await importWeekPlan(repo, [makeDraft()], NOW, "ws-1");

    expect(created).toMatchObject({
      scheduleType: "specific_date",
      scheduleDate: "2026-09-02",
      recurringDays: null,
    });
  });

  it("cria a recorrente com os dias, e sem data", async () => {
    const repo = makeRepo();

    const [created] = await importWeekPlan(
      repo,
      [makeDraft({ scheduleType: "recurring", scheduleDate: null, recurringDays: [1, 3] })],
      NOW,
      "ws-1"
    );

    expect(created).toMatchObject({
      scheduleType: "recurring",
      recurringDays: [1, 3],
      scheduleDate: null,
    });
  });

  it("preserva a hora marcada quando o rascunho tem uma", async () => {
    const repo = makeRepo();

    const [created] = await importWeekPlan(
      repo,
      [makeDraft({ startTime: "09:00", endTime: "09:30" })],
      NOW,
      "ws-1"
    );

    expect(created).toMatchObject({ startTime: "09:00", endTime: "09:30" });
  });

  it("nasce no workspace passado, e sem ação nenhuma", async () => {
    const repo = makeRepo();

    // O plano não tem de onde tirar link: ele veio de uma frase, não de um
    // evento nem de um item de board.
    const [created] = await importWeekPlan(repo, [makeDraft()], NOW, "ws-2");

    expect(created.workspaceId).toBe("ws-2");
    expect(created.actions).toEqual([]);
  });

  it("grava o instante recebido como criação", async () => {
    const repo = makeRepo();
    const [created] = await importWeekPlan(repo, [makeDraft()], NOW, "ws-1");
    expect(created.createdAt).toBe(NOW);
  });
});

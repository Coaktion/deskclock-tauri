import { describe, it, expect } from "vitest";
import { actionsOfPlanned, actionsOfTasks, indexPlannedById } from "@domain/utils/plannedActions";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";

const URL_ACTION: PlannedTaskAction = { type: "open_url", value: "https://exemplo.com" };
const FILE_ACTION: PlannedTaskAction = { type: "open_file", value: "/tmp/relatorio.pdf" };

function makePlanned(id: string, actions: PlannedTaskAction[]): PlannedTask {
  return {
    id,
    workspaceId: "ws-1",
    name: `Planejada ${id}`,
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions,
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
  };
}

function makeTask(id: string, plannedTaskId?: string | null): Task {
  return {
    id,
    workspaceId: "ws-1",
    name: `Tarefa ${id}`,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: null,
    durationSeconds: null,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
    plannedTaskId,
  };
}

const INDEX = indexPlannedById([
  makePlanned("com-acoes", [URL_ACTION]),
  makePlanned("outra-com-acoes", [FILE_ACTION]),
  makePlanned("sem-acoes", []),
]);

describe("actionsOfPlanned", () => {
  it("id nulo ou ausente não tem ações", () => {
    expect(actionsOfPlanned(INDEX, null)).toEqual([]);
    expect(actionsOfPlanned(INDEX, undefined)).toEqual([]);
    expect(actionsOfPlanned(INDEX, "")).toEqual([]);
  });

  it("devolve as ações atuais da planejada", () => {
    expect(actionsOfPlanned(INDEX, "com-acoes")).toEqual([URL_ACTION]);
  });

  it("planejada excluída não oferece nada — a ação nunca foi copiada para a tarefa", () => {
    expect(actionsOfPlanned(INDEX, "excluida")).toEqual([]);
  });

  it("planejada sem ações devolve vazio", () => {
    expect(actionsOfPlanned(INDEX, "sem-acoes")).toEqual([]);
  });

  it("o vazio é sempre a mesma referência, para não mudar identidade a cada render", () => {
    expect(actionsOfPlanned(INDEX, null)).toBe(actionsOfPlanned(INDEX, "excluida"));
    expect(actionsOfPlanned(INDEX, "sem-acoes")).toBe(actionsOfTasks(INDEX, []));
  });
});

describe("actionsOfTasks", () => {
  it("lista vazia não tem ações", () => {
    expect(actionsOfTasks(INDEX, [])).toEqual([]);
  });

  it("a primeira tarefa sem vínculo é pulada e a segunda decide", () => {
    const tasks = [makeTask("t1", null), makeTask("t2", "com-acoes")];
    expect(actionsOfTasks(INDEX, tasks)).toEqual([URL_ACTION]);
  });

  it("a primeira aponta para planejada sem ações e a segunda para uma com ações", () => {
    const tasks = [makeTask("t1", "sem-acoes"), makeTask("t2", "outra-com-acoes")];
    expect(actionsOfTasks(INDEX, tasks)).toEqual([FILE_ACTION]);
  });

  it("entre duas com ações, vale a ordem dada", () => {
    const tasks = [makeTask("t1", "outra-com-acoes"), makeTask("t2", "com-acoes")];
    expect(actionsOfTasks(INDEX, tasks)).toEqual([FILE_ACTION]);
  });

  it("todas as origens excluídas ou sem vínculo resultam em vazio", () => {
    const tasks = [makeTask("t1", "excluida"), makeTask("t2")];
    expect(actionsOfTasks(INDEX, tasks)).toEqual([]);
  });
});

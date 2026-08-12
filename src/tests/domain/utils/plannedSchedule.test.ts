import { describe, it, expect } from "vitest";
import { groupPlannedBySchedule } from "@domain/utils/plannedSchedule";
import type { PlannedTask } from "@domain/entities/PlannedTask";

function planned(id: string, startTime?: string): PlannedTask {
  return {
    id,
    workspaceId: "ws-1",
    name: id,
    projectId: null,
    categoryId: null,
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-08-12",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-12T09:00:00.000Z",
    customValues: {},
    startTime,
  };
}

describe("groupPlannedBySchedule", () => {
  it("lista vazia devolve os dois grupos vazios", () => {
    expect(groupPlannedBySchedule([])).toEqual({ timed: [], untimed: [] });
  });

  it("separa quem tem hora marcada de quem não tem", () => {
    const { timed, untimed } = groupPlannedBySchedule([
      planned("reunião", "14:00"),
      planned("revisar PR"),
    ]);
    expect(timed.map((t) => t.id)).toEqual(["reunião"]);
    expect(untimed.map((t) => t.id)).toEqual(["revisar PR"]);
  });

  it("ordena pelo relógio, não pela ordem de chegada", () => {
    const { timed } = groupPlannedBySchedule([
      planned("tarde", "16:00"),
      planned("manhã", "09:30"),
      planned("almoço", "12:00"),
    ]);
    expect(timed.map((t) => t.id)).toEqual(["manhã", "almoço", "tarde"]);
  });

  it("mesmo horário mantém a ordem recebida — é o sort_order do repositório", () => {
    const { timed } = groupPlannedBySchedule([
      planned("primeira", "09:00"),
      planned("segunda", "09:00"),
      planned("terceira", "09:00"),
    ]);
    expect(timed.map((t) => t.id)).toEqual(["primeira", "segunda", "terceira"]);
  });

  it("sem hora preserva a ordem recebida — é ela que o arraste do Planejamento grava", () => {
    const { untimed } = groupPlannedBySchedule([
      planned("terceira"),
      planned("primeira"),
      planned("segunda"),
    ]);
    expect(untimed.map((t) => t.id)).toEqual(["terceira", "primeira", "segunda"]);
  });

  it("horário em branco é ausência de horário, não um horário vazio", () => {
    const { timed, untimed } = groupPlannedBySchedule([
      planned("vazia", ""),
      planned("espaço", " "),
    ]);
    expect(timed).toEqual([]);
    expect(untimed.map((t) => t.id)).toEqual(["vazia", "espaço"]);
  });

  it("não mexe na lista recebida", () => {
    const tasks = [planned("tarde", "16:00"), planned("manhã", "09:00")];
    groupPlannedBySchedule(tasks);
    expect(tasks.map((t) => t.id)).toEqual(["tarde", "manhã"]);
  });
});

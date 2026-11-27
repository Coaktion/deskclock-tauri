import { describe, it, expect } from "vitest";
import { groupTasksByDay } from "@domain/utils/groupTasksByDay";
import type { Task } from "@domain/entities/Task";

// Instantes montados na hora local: o agrupamento é por dia local, e um ISO com
// `Z` cairia em outro dia conforme o fuso da máquina que roda o teste.
function localISO(day: number, hour: number, minute = 0): string {
  return new Date(2026, 3, day, hour, minute).toISOString();
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Task A",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: localISO(8, 9),
    endTime: localISO(8, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(8, 9),
    updatedAt: localISO(8, 10),
    customValues: {},
    ...overrides,
  };
}

describe("groupTasksByDay", () => {
  it("devolve o dia mais recente primeiro", () => {
    const days = groupTasksByDay([
      makeTask({ id: "a", startTime: localISO(7, 9) }),
      makeTask({ id: "b", startTime: localISO(9, 9) }),
      makeTask({ id: "c", startTime: localISO(8, 9) }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-04-09", "2026-04-08", "2026-04-07"]);
  });

  it("separa pelo dia local: 23:59 e 00:00 caem em dias diferentes", () => {
    const days = groupTasksByDay([
      makeTask({ id: "noite", startTime: localISO(8, 23, 59) }),
      makeTask({ id: "madrugada", startTime: localISO(9, 0, 0) }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0].groups[0].tasks.map((t) => t.id)).toEqual(["madrugada"]);
    expect(days[1].groups[0].tasks.map((t) => t.id)).toEqual(["noite"]);
  });

  it("agrupa dentro do dia pela chave de agrupamento", () => {
    const [day] = groupTasksByDay([
      makeTask({ id: "a" }),
      makeTask({ id: "b", startTime: localISO(8, 14) }),
      makeTask({ id: "c", name: "Outra" }),
    ]);
    expect(day.groups).toHaveLength(2);
    expect(day.groups.flatMap((g) => g.tasks.map((t) => t.id)).sort()).toEqual(["a", "b", "c"]);
  });
});

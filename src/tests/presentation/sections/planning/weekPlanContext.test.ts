import { describe, expect, it } from "vitest";

import type { PlannedTask } from "@domain/entities/PlannedTask";
import { existingPlanLines, weekPlanDays } from "@presentation/sections/planning/weekPlanContext";

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    workspaceId: "ws1",
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

describe("weekPlanDays", () => {
  it("nomeia cada dia por extenso, que é como o pedido fala", () => {
    expect(weekPlanDays(["2026-08-31", "2026-09-04"])).toEqual([
      { dateISO: "2026-08-31", weekday: "segunda" },
      { dateISO: "2026-09-04", weekday: "sexta" },
    ]);
  });
});

describe("existingPlanLines", () => {
  it("descreve a tarefa de dia único pelo dia da semana e pela data", () => {
    expect(existingPlanLines([makeTask()])).toEqual([
      { name: "Alinhamento", when: "quarta (2026-09-02)" },
    ]);
  });

  it("descreve a recorrente pelos dias em que ela cai", () => {
    const task = makeTask({ scheduleType: "recurring", scheduleDate: null, recurringDays: [1, 3] });
    expect(existingPlanLines([task])[0].when).toBe("toda segunda e quarta");
  });

  it("descreve o período pelas duas pontas", () => {
    const task = makeTask({
      scheduleType: "period",
      scheduleDate: null,
      periodStart: "2026-08-31",
      periodEnd: "2026-09-04",
    });
    expect(existingPlanLines([task])[0].when).toBe("de 2026-08-31 a 2026-09-04");
  });

  it("deixa de fora a tarefa sem nome, que não diz nada ao modelo", () => {
    expect(existingPlanLines([makeTask({ name: "  " })])).toEqual([]);
  });
});

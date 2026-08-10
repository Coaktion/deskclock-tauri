import { describe, it, expect } from "vitest";
import { pendingPlannedTasks } from "@domain/utils/plannedPending";
import type { PlannedTask } from "@domain/entities/PlannedTask";

function planned(id: string, completedDates: string[]): PlannedTask {
  return {
    id,
    workspaceId: "ws-1",
    name: id,
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-08-10",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates,
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-10T09:00:00.000Z",
    customValues: {},
  };
}

describe("pendingPlannedTasks", () => {
  it("tira as concluídas no dia e mantém as concluídas em outro", () => {
    const tasks = [
      planned("pendente", []),
      planned("concluída hoje", ["2026-08-10"]),
      planned("concluída ontem", ["2026-08-09"]),
    ];
    expect(pendingPlannedTasks(tasks, "2026-08-10").map((t) => t.id)).toEqual([
      "pendente",
      "concluída ontem",
    ]);
  });

  it("dia sem pendente devolve lista vazia — é o que decide o arranjo da tela", () => {
    expect(pendingPlannedTasks([planned("única", ["2026-08-10"])], "2026-08-10")).toEqual([]);
  });
});

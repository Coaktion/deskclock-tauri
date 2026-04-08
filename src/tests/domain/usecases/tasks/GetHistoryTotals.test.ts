import { describe, it, expect } from "vitest";
import { getHistoryTotals } from "@domain/usecases/tasks/GetHistoryTotals";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: null,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("getHistoryTotals", () => {
  it("retorna zeros para lista vazia", () => {
    const result = getHistoryTotals([]);
    expect(result.totalSeconds).toBe(0);
    expect(result.billableSeconds).toBe(0);
    expect(result.nonBillableSeconds).toBe(0);
    expect(result.count).toBe(0);
  });

  it("soma duração total corretamente", () => {
    const tasks = [
      makeTask({ durationSeconds: 3600 }),
      makeTask({ id: "t2", durationSeconds: 1800 }),
    ];
    const result = getHistoryTotals(tasks);
    expect(result.totalSeconds).toBe(5400);
    expect(result.count).toBe(2);
  });

  it("separa billable e non-billable", () => {
    const tasks = [
      makeTask({ billable: true, durationSeconds: 3600 }),
      makeTask({ id: "t2", billable: false, durationSeconds: 1800 }),
    ];
    const result = getHistoryTotals(tasks);
    expect(result.billableSeconds).toBe(3600);
    expect(result.nonBillableSeconds).toBe(1800);
  });

  it("trata durationSeconds null como 0", () => {
    const tasks = [makeTask({ durationSeconds: null })];
    const result = getHistoryTotals(tasks);
    expect(result.totalSeconds).toBe(0);
  });
});

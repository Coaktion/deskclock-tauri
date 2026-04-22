import { describe, it, expect, vi } from "vitest";
import { getTodayTotals } from "@domain/usecases/tasks/GetTodayTotals";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
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

function makeRepo(tasks: Task[]): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => tasks),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

describe("getTodayTotals", () => {
  it("soma billable e non-billable separadamente", async () => {
    const tasks = [
      makeTask({ id: "t1", billable: true, durationSeconds: 3600 }),
      makeTask({ id: "t2", billable: false, durationSeconds: 1800 }),
      makeTask({ id: "t3", billable: true, durationSeconds: 900 }),
    ];
    const repo = makeRepo(tasks);
    const result = await getTodayTotals(repo, "2026-04-08");
    expect(result.billableSeconds).toBe(4500);
    expect(result.nonBillableSeconds).toBe(1800);
  });

  it("retorna zeros quando não há tarefas", async () => {
    const repo = makeRepo([]);
    const result = await getTodayTotals(repo, "2026-04-08");
    expect(result.billableSeconds).toBe(0);
    expect(result.nonBillableSeconds).toBe(0);
  });

  it("usa durationSeconds nulo como 0", async () => {
    const tasks = [makeTask({ id: "t1", billable: true, durationSeconds: null })];
    const repo = makeRepo(tasks);
    const result = await getTodayTotals(repo, "2026-04-08");
    expect(result.billableSeconds).toBe(0);
  });
});

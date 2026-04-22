import { describe, it, expect, vi } from "vitest";
import { getWeekTotal } from "@domain/usecases/tasks/GetWeekTotal";
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

describe("getWeekTotal", () => {
  it("soma durações de todas as tarefas da semana", async () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: 3600 }),
      makeTask({ id: "t2", durationSeconds: 7200 }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => tasks),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.totalSeconds).toBe(10800);
  });

  it("retorna zero quando sem tarefas", async () => {
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.totalSeconds).toBe(0);
  });

  it("conta apenas dias com tarefas", async () => {
    const tasks = [
      makeTask({ id: "t1", startTime: "2026-04-07T09:00:00.000Z", durationSeconds: 1800 }),
      makeTask({ id: "t2", startTime: "2026-04-09T10:00:00.000Z", durationSeconds: 900 }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => tasks),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.totalSeconds).toBe(2700);
    expect(result.daysWorked).toBe(2);
  });
});

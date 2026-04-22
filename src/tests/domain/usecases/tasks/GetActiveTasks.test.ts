import { describe, it, expect, vi } from "vitest";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
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
    endTime: null,
    durationSeconds: 0,
    status: "running",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T09:00:00.000Z",
    ...overrides,
  };
}

describe("getActiveTasks", () => {
  it("retorna tasks running e paused concatenadas", async () => {
    const running = makeTask({ id: "r1", status: "running" });
    const paused = makeTask({ id: "p1", status: "paused" });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async (s) => (s === "running" ? [running] : [paused])),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getActiveTasks(repo);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toContain("r1");
    expect(result.map((t) => t.id)).toContain("p1");
  });

  it("retorna array vazio quando sem tasks ativas", async () => {
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getActiveTasks(repo);
    expect(result).toHaveLength(0);
  });
});

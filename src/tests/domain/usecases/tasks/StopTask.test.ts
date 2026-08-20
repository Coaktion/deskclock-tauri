import { describe, it, expect, vi } from "vitest";
import { stopTask } from "@domain/usecases/tasks/StopTask";
import { DomainError } from "@shared/errors";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
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
    customValues: {},
    ...overrides,
  };
}

const NOW = "2026-04-08T09:01:00.000Z"; // 60s depois do start

describe("stopTask", () => {
  it("muda status para completed", async () => {
    const task = makeTask();
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await stopTask(repo, "t1", NOW);
    expect(result.status).toBe("completed");
  });

  it("define endTime = now", async () => {
    const task = makeTask();
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await stopTask(repo, "t1", NOW);
    expect(result.endTime).toBe(NOW);
  });

  it("calcula segmento final para task running", async () => {
    const task = makeTask({ durationSeconds: 30, startTime: "2026-04-08T09:00:00.000Z" });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await stopTask(repo, "t1", NOW);
    expect(result.durationSeconds).toBe(90); // 30 + 60
  });

  it("não adiciona segmento para task paused", async () => {
    const task = makeTask({ status: "paused", durationSeconds: 300 });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await stopTask(repo, "t1", NOW);
    expect(result.durationSeconds).toBe(300);
  });

  it("usa endTimeISO fornecido para endTime e cálculo de duração", async () => {
    const task = makeTask({ durationSeconds: 0, startTime: "2026-04-08T09:00:00.000Z" });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const customEnd = "2026-04-08T09:30:00.000Z"; // 30 min depois do start
    const realNow = "2026-04-08T11:00:00.000Z"; // 2h depois — usuário esqueceu de parar
    const result = await stopTask(repo, "t1", customEnd, realNow);
    expect(result.endTime).toBe(customEnd);
    expect(result.durationSeconds).toBe(1800); // 30 min
    expect(result.updatedAt).toBe(realNow);
  });

  it("lança DomainError se task já está completed", async () => {
    const task = makeTask({ status: "completed" });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await expect(stopTask(repo, "t1", NOW)).rejects.toThrow(DomainError);
  });
});

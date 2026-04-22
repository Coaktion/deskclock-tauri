import { describe, it, expect, vi } from "vitest";
import { pauseTask } from "@domain/usecases/tasks/PauseTask";
import { DomainError } from "@shared/errors";
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

function makeRepo(task: Task | null = null): ITaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => task),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
  };
}

const START = "2026-04-08T09:00:00.000Z";
const NOW = "2026-04-08T09:01:00.000Z"; // 60s depois

describe("pauseTask", () => {
  it("muda status para paused", async () => {
    const task = makeTask({ startTime: START });
    const repo = makeRepo(task);
    const result = await pauseTask(repo, "t1", NOW);
    expect(result.status).toBe("paused");
  });

  it("acumula o segmento em durationSeconds", async () => {
    const task = makeTask({ startTime: START, durationSeconds: 30 });
    const repo = makeRepo(task);
    const result = await pauseTask(repo, "t1", NOW);
    expect(result.durationSeconds).toBe(90); // 30 + 60
  });

  it("atualiza startTime para now ao pausar", async () => {
    const task = makeTask({ startTime: START });
    const repo = makeRepo(task);
    const result = await pauseTask(repo, "t1", NOW);
    expect(result.startTime).toBe(NOW);
  });

  it("chama repository.update", async () => {
    const task = makeTask({ startTime: START });
    const repo = makeRepo(task);
    await pauseTask(repo, "t1", NOW);
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it("lança DomainError se tarefa não encontrada", async () => {
    const repo = makeRepo(null);
    await expect(pauseTask(repo, "t1", NOW)).rejects.toThrow(DomainError);
  });

  it("lança DomainError se tarefa já está paused", async () => {
    const task = makeTask({ status: "paused" });
    const repo = makeRepo(task);
    await expect(pauseTask(repo, "t1", NOW)).rejects.toThrow(DomainError);
  });

  it("lança DomainError se tarefa está completed", async () => {
    const task = makeTask({ status: "completed" });
    const repo = makeRepo(task);
    await expect(pauseTask(repo, "t1", NOW)).rejects.toThrow(DomainError);
  });
});

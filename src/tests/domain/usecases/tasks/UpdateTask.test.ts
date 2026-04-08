import { describe, it, expect, vi } from "vitest";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { DomainError } from "@shared/errors";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Original",
    projectId: "p1",
    categoryId: "c1",
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

const NOW = "2026-04-08T09:05:00.000Z";

describe("updateTask", () => {
  it("atualiza apenas os campos fornecidos", async () => {
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
    const result = await updateTask(repo, "t1", { name: "Novo Nome" }, NOW);
    expect(result.name).toBe("Novo Nome");
    expect(result.projectId).toBe("p1"); // inalterado
  });

  it("aceita name=null", async () => {
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
    const result = await updateTask(repo, "t1", { name: null }, NOW);
    expect(result.name).toBeNull();
  });

  it("atualiza updatedAt", async () => {
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
    const result = await updateTask(repo, "t1", { billable: false }, NOW);
    expect(result.updatedAt).toBe(NOW);
  });

  it("lança DomainError se task não encontrada", async () => {
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await expect(updateTask(repo, "t1", {}, NOW)).rejects.toThrow(DomainError);
  });

  it("chama repository.update", async () => {
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
    await updateTask(repo, "t1", { name: "X" }, NOW);
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it("atualiza startTime corretamente", async () => {
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
    const newStart = "2026-04-08T08:00:00.000Z";
    const result = await updateTask(repo, "t1", { startTime: newStart }, NOW);
    expect(result.startTime).toBe(newStart);
  });

  it("atualiza endTime e durationSeconds juntos", async () => {
    const task = makeTask({ status: "completed" });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const newEnd = "2026-04-08T11:00:00.000Z";
    const result = await updateTask(repo, "t1", { endTime: newEnd, durationSeconds: 7200 }, NOW);
    expect(result.endTime).toBe(newEnd);
    expect(result.durationSeconds).toBe(7200);
  });

  it("mantém campos não fornecidos inalterados ao editar data", async () => {
    const task = makeTask({ name: "Manter", billable: false });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await updateTask(repo, "t1", {
      startTime: "2026-04-08T07:00:00.000Z",
      endTime: "2026-04-08T09:00:00.000Z",
      durationSeconds: 7200,
    }, NOW);
    expect(result.name).toBe("Manter");
    expect(result.billable).toBe(false);
    expect(result.durationSeconds).toBe(7200);
  });
});

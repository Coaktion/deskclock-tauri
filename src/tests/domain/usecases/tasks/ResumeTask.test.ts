import { describe, it, expect, vi } from "vitest";
import { resumeTask } from "@domain/usecases/tasks/ResumeTask";
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
    startTime: "2026-04-08T09:05:00.000Z",
    endTime: null,
    durationSeconds: 300,
    status: "paused",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T09:05:00.000Z",
    ...overrides,
  };
}

const NOW = "2026-04-08T09:10:00.000Z";

describe("resumeTask", () => {
  it("muda status para running", async () => {
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
    const result = await resumeTask(repo, "t1", NOW);
    expect(result.status).toBe("running");
  });

  it("atualiza startTime para now ao retomar", async () => {
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
    const result = await resumeTask(repo, "t1", NOW);
    expect(result.startTime).toBe(NOW);
  });

  it("preserva durationSeconds acumulado", async () => {
    const task = makeTask({ durationSeconds: 300 });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await resumeTask(repo, "t1", NOW);
    expect(result.durationSeconds).toBe(300);
  });

  it("para task running existente antes de retomar", async () => {
    const running: Task = { ...makeTask(), id: "other", status: "running" };
    const paused = makeTask();
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(async () => undefined),
      findById: vi.fn(async (id) => (id === "t1" ? paused : running)),
      findByStatus: vi.fn(async () => [running]),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await resumeTask(repo, "t1", NOW);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "other", status: "completed" })
    );
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
    await expect(resumeTask(repo, "t1", NOW)).rejects.toThrow(DomainError);
  });

  it("lança DomainError se task não está paused", async () => {
    const task = makeTask({ status: "running" });
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => task),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await expect(resumeTask(repo, "t1", NOW)).rejects.toThrow(DomainError);
  });
});

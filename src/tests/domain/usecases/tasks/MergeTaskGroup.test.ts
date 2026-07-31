import { describe, it, expect, vi } from "vitest";
import { mergeTaskGroup } from "@domain/usecases/tasks/MergeTaskGroup";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

const NOW = "2026-04-08T11:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Task A",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

describe("mergeTaskGroup", () => {
  it("cria um registro com duração somada", async () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: 3600 }),
      makeTask({
        id: "t2",
        durationSeconds: 1800,
        startTime: "2026-04-08T10:00:00.000Z",
        endTime: "2026-04-08T10:30:00.000Z",
      }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(async () => undefined),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(async () => undefined),
    };
    const result = await mergeTaskGroup(repo, tasks, NOW);
    expect(result.durationSeconds).toBe(5400);
  });

  it("preserva os valores personalizados do grupo", async () => {
    // Só entram no mesmo grupo tarefas com os mesmos valores (§6.3) — unificar
    // não pode perdê-los, ou o registro somado cairia em outro grupo.
    const tasks = [
      makeTask({ id: "t1", customValues: { "f-stage": "o1" } }),
      makeTask({
        id: "t2",
        customValues: { "f-stage": "o1" },
        startTime: "2026-04-08T10:00:00.000Z",
        endTime: "2026-04-08T10:30:00.000Z",
        durationSeconds: 1800,
      }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(async () => undefined),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(async () => undefined),
    };
    const result = await mergeTaskGroup(repo, tasks, NOW);
    expect(result.customValues).toEqual({ "f-stage": "o1" });
  });

  it("exclui os registros originais via deleteMany", async () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: 3600 }),
      makeTask({
        id: "t2",
        durationSeconds: 900,
        startTime: "2026-04-08T10:00:00.000Z",
        endTime: "2026-04-08T10:15:00.000Z",
      }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(async () => undefined),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(async () => undefined),
    };
    await mergeTaskGroup(repo, tasks, NOW);
    expect(repo.deleteMany).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("novo registro usa startTime do mais antigo", async () => {
    const tasks = [
      makeTask({ id: "t1", startTime: "2026-04-08T10:00:00.000Z", durationSeconds: 1800 }),
      makeTask({ id: "t2", startTime: "2026-04-08T09:00:00.000Z", durationSeconds: 3600 }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(async () => undefined),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(async () => undefined),
    };
    const result = await mergeTaskGroup(repo, tasks, NOW);
    expect(result.startTime).toBe("2026-04-08T09:00:00.000Z");
  });

  it("novo registro herda name/projectId/categoryId/billable do primeiro", async () => {
    const tasks = [
      makeTask({
        id: "t1",
        workspaceId: "ws-1",
        name: "Task A",
        projectId: "p1",
        categoryId: "c1",
        billable: true,
      }),
      makeTask({
        id: "t2",
        workspaceId: "ws-1",
        name: "Task A",
        projectId: "p1",
        categoryId: "c1",
        billable: true,
      }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(async () => undefined),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(async () => undefined),
    };
    const result = await mergeTaskGroup(repo, tasks, NOW);
    expect(result.name).toBe("Task A");
    expect(result.projectId).toBe("p1");
    expect(result.categoryId).toBe("c1");
    expect(result.billable).toBe(true);
  });
});

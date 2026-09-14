import { describe, it, expect, vi } from "vitest";
import { updateTaskGroup } from "@domain/usecases/tasks/UpdateTaskGroup";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { localISO } from "../../../helpers/localTime";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Reunião",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: localISO(2026, 8, 11, 9),
    endTime: localISO(2026, 8, 11, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 8, 11, 9),
    updatedAt: localISO(2026, 8, 11, 10),
    customValues: {},
    ...overrides,
  };
}

const NOW = localISO(2026, 8, 11, 18);

function makeRepo(tasks: Task[]): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async (id: string) => tasks.find((t) => t.id === id) ?? null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    findLastDayWithCompletedTasks: vi.fn(async () => null),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

describe("updateTaskGroup", () => {
  it("aplica a mesma edição a todas as tarefas do grupo", async () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" }), makeTask({ id: "t3" })];
    const repo = makeRepo(tasks);

    const result = await updateTaskGroup(repo, tasks, { name: "Daily", projectId: "p2" }, NOW);

    expect(result).toHaveLength(3);
    expect(result.map((t) => t.name)).toEqual(["Daily", "Daily", "Daily"]);
    expect(result.map((t) => t.projectId)).toEqual(["p2", "p2", "p2"]);
    expect(repo.update).toHaveBeenCalledTimes(3);
  });

  it("mantém o que não foi editado, tarefa a tarefa", async () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: 1800 }),
      makeTask({ id: "t2", durationSeconds: 5400 }),
    ];
    const repo = makeRepo(tasks);

    const result = await updateTaskGroup(repo, tasks, { billable: false }, NOW);

    expect(result.map((t) => t.durationSeconds)).toEqual([1800, 5400]);
    expect(result.every((t) => t.billable === false)).toBe(true);
  });

  it("marca updatedAt em todas", async () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    const repo = makeRepo(tasks);

    const result = await updateTaskGroup(repo, tasks, { categoryId: "c9" }, NOW);

    expect(result.every((t) => t.updatedAt === NOW)).toBe(true);
  });

  it("grupo vazio não escreve nada", async () => {
    const repo = makeRepo([]);

    const result = await updateTaskGroup(repo, [], { name: "X" }, NOW);

    expect(result).toEqual([]);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

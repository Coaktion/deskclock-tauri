import { describe, it, expect, vi } from "vitest";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

function makeRepo(tasks: Task[]): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByStatus: vi.fn(),
    findByDateRange: vi.fn(async () => tasks),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Dev",
    projectId: "p1",
    categoryId: "c1",
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

describe("searchTasks", () => {
  it("busca pelo período e retorna todas quando sem outros filtros", async () => {
    const tasks = [makeTask(), makeTask({ id: "t2" })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
    });
    expect(repo.findByDateRange).toHaveBeenCalledWith(
      "2026-04-08T00:00:00.000Z",
      "2026-04-08T23:59:59.999Z"
    );
    expect(result).toHaveLength(2);
  });

  it("filtra apenas tarefas completed", async () => {
    const tasks = [makeTask({ status: "completed" }), makeTask({ id: "t2", status: "running" })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
    });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("completed");
  });

  it("filtra por nome (case insensitive, parcial)", async () => {
    const tasks = [makeTask({ name: "Dev frontend" }), makeTask({ id: "t2", name: "Reunião" })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
      name: "dev",
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Dev frontend");
  });

  it("filtra por projectId", async () => {
    const tasks = [makeTask({ projectId: "p1" }), makeTask({ id: "t2", projectId: "p2" })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
      projectId: "p1",
    });
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe("p1");
  });

  it("filtra por categoryId", async () => {
    const tasks = [makeTask({ categoryId: "c1" }), makeTask({ id: "t2", categoryId: "c2" })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
      categoryId: "c1",
    });
    expect(result).toHaveLength(1);
  });

  it("filtra billable=true", async () => {
    const tasks = [makeTask({ billable: true }), makeTask({ id: "t2", billable: false })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
      billable: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].billable).toBe(true);
  });

  it("filtra billable=false", async () => {
    const tasks = [makeTask({ billable: true }), makeTask({ id: "t2", billable: false })];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
      billable: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].billable).toBe(false);
  });

  it("combina múltiplos filtros", async () => {
    const tasks = [
      makeTask({ name: "Dev", projectId: "p1", billable: true }),
      makeTask({ id: "t2", name: "Dev", projectId: "p2", billable: true }),
      makeTask({ id: "t3", name: "Reunião", projectId: "p1", billable: false }),
    ];
    const repo = makeRepo(tasks);
    const result = await searchTasks(repo, {
      startISO: "2026-04-08T00:00:00.000Z",
      endISO: "2026-04-08T23:59:59.999Z",
      name: "dev",
      projectId: "p1",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });
});

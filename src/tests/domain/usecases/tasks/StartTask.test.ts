import { describe, it, expect, vi } from "vitest";
import { startTask } from "@domain/usecases/tasks/StartTask";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

function makeRepo(overrides: Partial<ITaskRepository> = {}): ITaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    ...overrides,
  };
}

const NOW = "2026-04-08T10:00:00.000Z";

describe("startTask", () => {
  it("cria uma nova task com status running", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { billable: true }, NOW);
    expect(task.status).toBe("running");
    expect(task.id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledWith(task);
  });

  it("usa now como startTime quando não fornecido", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { billable: true }, NOW);
    expect(task.startTime).toBe(NOW);
  });

  it("usa startTime customizado quando fornecido", async () => {
    const repo = makeRepo();
    const custom = "2026-04-08T08:00:00.000Z";
    const task = await startTask(repo, { billable: true, startTime: custom }, NOW);
    expect(task.startTime).toBe(custom);
  });

  it("preenche campos opcionais quando fornecidos", async () => {
    const repo = makeRepo();
    const task = await startTask(
      repo,
      { name: "Dev", projectId: "p1", categoryId: "c1", billable: false },
      NOW
    );
    expect(task.name).toBe("Dev");
    expect(task.projectId).toBe("p1");
    expect(task.categoryId).toBe("c1");
    expect(task.billable).toBe(false);
  });

  it("durationSeconds inicial é 0", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { billable: true }, NOW);
    expect(task.durationSeconds).toBe(0);
  });

  it("para task running existente antes de iniciar nova", async () => {
    const running: Task = {
      id: "old",
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
    };
    const repo = makeRepo({ findByStatus: vi.fn(async () => [running]) });
    await startTask(repo, { billable: true }, NOW);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "old", status: "completed" })
    );
  });

  it("para task paused existente antes de iniciar nova", async () => {
    const paused: Task = {
      id: "old2",
      name: null,
      projectId: null,
      categoryId: null,
      billable: true,
      startTime: "2026-04-08T09:00:00.000Z",
      endTime: null,
      durationSeconds: 300,
      status: "paused",
      createdAt: "2026-04-08T09:00:00.000Z",
      updatedAt: "2026-04-08T09:30:00.000Z",
    };
    const repo = makeRepo({ findByStatus: vi.fn(async () => [paused]) });
    await startTask(repo, { billable: true }, NOW);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "old2", status: "completed" })
    );
  });
});

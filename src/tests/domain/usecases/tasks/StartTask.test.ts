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
    findLastDayWithCompletedTasks: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    ...overrides,
  };
}

const NOW = "2026-04-08T10:00:00.000Z";

describe("startTask", () => {
  it("cria uma nova task com status running", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { workspaceId: "ws-1", billable: true }, NOW);
    expect(task.status).toBe("running");
    expect(task.id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledWith(task);
  });

  it("usa now como startTime quando não fornecido", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { workspaceId: "ws-1", billable: true }, NOW);
    expect(task.startTime).toBe(NOW);
  });

  it("persiste a planejada de origem quando o início partiu de uma", async () => {
    const repo = makeRepo();
    const task = await startTask(
      repo,
      { workspaceId: "ws-1", billable: true, plannedTaskId: "pt-1" },
      NOW
    );
    // Persistido, não só carregado em memória: é o que sobrevive ao reabrir o app
    // e faz o Parar marcar a planejada como concluída no dia.
    expect(task.plannedTaskId).toBe("pt-1");
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ plannedTaskId: "pt-1" }));
  });

  it("grava null quando a tarefa não veio de planejada", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { workspaceId: "ws-1", billable: true }, NOW);
    expect(task.plannedTaskId).toBeNull();
  });

  it("usa startTime customizado quando fornecido", async () => {
    const repo = makeRepo();
    const custom = "2026-04-08T08:00:00.000Z";
    const task = await startTask(
      repo,
      { workspaceId: "ws-1", billable: true, startTime: custom },
      NOW
    );
    expect(task.startTime).toBe(custom);
  });

  it("preenche campos opcionais quando fornecidos", async () => {
    const repo = makeRepo();
    const task = await startTask(
      repo,
      { workspaceId: "ws-1", name: "Dev", projectId: "p1", categoryId: "c1", billable: false },
      NOW
    );
    expect(task.name).toBe("Dev");
    expect(task.projectId).toBe("p1");
    expect(task.categoryId).toBe("c1");
    expect(task.billable).toBe(false);
  });

  it("durationSeconds inicial é 0", async () => {
    const repo = makeRepo();
    const task = await startTask(repo, { workspaceId: "ws-1", billable: true }, NOW);
    expect(task.durationSeconds).toBe(0);
  });

  it("para task running existente antes de iniciar nova", async () => {
    const running: Task = {
      id: "old",
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
    };
    const repo = makeRepo({ findByStatus: vi.fn(async () => [running]) });
    await startTask(repo, { workspaceId: "ws-1", billable: true }, NOW);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "old", status: "completed" })
    );
  });

  it("para task paused existente antes de iniciar nova", async () => {
    const paused: Task = {
      id: "old2",
      workspaceId: "ws-1",
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
      customValues: {},
    };
    const repo = makeRepo({ findByStatus: vi.fn(async () => [paused]) });
    await startTask(repo, { workspaceId: "ws-1", billable: true }, NOW);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "old2", status: "completed" })
    );
  });
});

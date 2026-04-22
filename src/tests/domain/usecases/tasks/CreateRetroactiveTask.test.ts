import { describe, it, expect, vi } from "vitest";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";

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

const NOW = "2026-04-08T12:00:00.000Z";
const START = "2026-04-08T09:00:00.000Z";
const END = "2026-04-08T10:30:00.000Z";
const DURATION = 5400; // 1h30m

describe("createRetroactiveTask", () => {
  it("cria tarefa com status completed", async () => {
    const repo = makeRepo();
    const task = await createRetroactiveTask(
      repo,
      {
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: START,
        endTime: END,
        durationSeconds: DURATION,
      },
      NOW
    );
    expect(task.status).toBe("completed");
  });

  it("persiste no repositório via save", async () => {
    const repo = makeRepo();
    const task = await createRetroactiveTask(
      repo,
      {
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: START,
        endTime: END,
        durationSeconds: DURATION,
      },
      NOW
    );
    expect(repo.save).toHaveBeenCalledWith(task);
  });

  it("preserva startTime, endTime e durationSeconds fornecidos", async () => {
    const repo = makeRepo();
    const task = await createRetroactiveTask(
      repo,
      {
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: START,
        endTime: END,
        durationSeconds: DURATION,
      },
      NOW
    );
    expect(task.startTime).toBe(START);
    expect(task.endTime).toBe(END);
    expect(task.durationSeconds).toBe(DURATION);
  });

  it("preenche campos opcionais quando fornecidos", async () => {
    const repo = makeRepo();
    const task = await createRetroactiveTask(
      repo,
      {
        name: "Reunião",
        projectId: "proj-1",
        categoryId: "cat-1",
        billable: false,
        startTime: START,
        endTime: END,
        durationSeconds: 3600,
      },
      NOW
    );
    expect(task.name).toBe("Reunião");
    expect(task.projectId).toBe("proj-1");
    expect(task.categoryId).toBe("cat-1");
    expect(task.billable).toBe(false);
  });

  it("aceita name null", async () => {
    const repo = makeRepo();
    const task = await createRetroactiveTask(
      repo,
      {
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: START,
        endTime: END,
        durationSeconds: DURATION,
      },
      NOW
    );
    expect(task.name).toBeNull();
  });

  it("gera id único a cada chamada", async () => {
    const repo = makeRepo();
    const input = {
      name: null,
      projectId: null,
      categoryId: null,
      billable: true,
      startTime: START,
      endTime: END,
      durationSeconds: DURATION,
    };
    const [t1, t2] = await Promise.all([
      createRetroactiveTask(repo, input, NOW),
      createRetroactiveTask(repo, input, NOW),
    ]);
    expect(t1.id).not.toBe(t2.id);
  });

  it("usa nowISO como createdAt e updatedAt", async () => {
    const repo = makeRepo();
    const task = await createRetroactiveTask(
      repo,
      {
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: START,
        endTime: END,
        durationSeconds: DURATION,
      },
      NOW
    );
    expect(task.createdAt).toBe(NOW);
    expect(task.updatedAt).toBe(NOW);
  });

  it("não consulta nem altera tarefas existentes", async () => {
    const repo = makeRepo();
    await createRetroactiveTask(
      repo,
      {
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: START,
        endTime: END,
        durationSeconds: DURATION,
      },
      NOW
    );
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.findByStatus).not.toHaveBeenCalled();
    expect(repo.findByDateRange).not.toHaveBeenCalled();
  });
});

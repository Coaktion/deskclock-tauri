import { describe, it, expect, vi } from "vitest";
import { editCompletedTask } from "@domain/usecases/tasks/EditCompletedTask";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { DomainError } from "@shared/errors";

const NOW = "2026-04-08T11:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Task A",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: "2026-04-08T12:00:00.000Z",
    endTime: "2026-04-08T13:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T12:00:00.000Z",
    updatedAt: "2026-04-08T13:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

/** Repositório em memória: o `update` grava, e o dia é lido do que está gravado. */
function makeRepo(initial: Task[]): ITaskRepository & { tasks: Map<string, Task> } {
  const tasks = new Map(initial.map((t) => [t.id, t]));
  return {
    tasks,
    save: vi.fn(async () => undefined),
    update: vi.fn(async (t: Task) => {
      tasks.set(t.id, t);
    }),
    findById: vi.fn(async (id: string) => tasks.get(id) ?? null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => [...tasks.values()]),
    findLastDayWithCompletedTasks: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
  };
}

describe("editCompletedTask", () => {
  it("grava a edição e devolve a tarefa atualizada", async () => {
    const repo = makeRepo([makeTask()]);

    const updated = await editCompletedTask(repo, "t1", { name: "Renomeada" }, NOW);

    expect(updated).toMatchObject({ id: "t1", name: "Renomeada", updatedAt: NOW });
    expect(repo.tasks.get("t1")?.name).toBe("Renomeada");
  });

  it("leva o billable salvo às irmãs do grupo", async () => {
    const repo = makeRepo([makeTask({ id: "t1" }), makeTask({ id: "irma" })]);

    await editCompletedTask(repo, "t1", { billable: false }, NOW);

    expect(repo.tasks.get("irma")?.billable).toBe(false);
  });

  it("quando a edição muda o grupo, o grupo novo recebe o billable da tarefa", async () => {
    const repo = makeRepo([
      makeTask({ id: "t1", name: "Task A", billable: true }),
      makeTask({ id: "antiga", name: "Task A", billable: true }),
      makeTask({ id: "nova", name: "Task B", billable: false }),
    ]);

    await editCompletedTask(repo, "t1", { name: "Task B" }, NOW);

    expect(repo.tasks.get("nova")?.billable).toBe(true);
    expect(repo.tasks.get("antiga")?.billable).toBe(true);
  });

  it("grupo já uniforme não gera escrita além da própria tarefa", async () => {
    const repo = makeRepo([makeTask({ id: "t1" }), makeTask({ id: "irma" })]);

    await editCompletedTask(repo, "t1", { name: "Task A" }, NOW);

    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it("tarefa inexistente lança DomainError sem tocar no grupo", async () => {
    const repo = makeRepo([]);

    await expect(editCompletedTask(repo, "nao-existe", { name: "x" }, NOW)).rejects.toBeInstanceOf(
      DomainError
    );
    expect(repo.findByDateRange).not.toHaveBeenCalled();
  });
});

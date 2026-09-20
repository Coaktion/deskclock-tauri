import { describe, it, expect, vi } from "vitest";
import { restoreTasks } from "@domain/usecases/tasks/RestoreTasks";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { localISO } from "../../../helpers/localTime";

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Reunião",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: localISO(2026, 4, 8, 9),
    endTime: localISO(2026, 4, 8, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 4, 8, 9),
    updatedAt: localISO(2026, 4, 8, 10),
    plannedTaskId: null,
    customValues: {},
    ...overrides,
  };
}

/**
 * Repositório em memória: `save` grava no mapa e `findById` lê dele, que é o
 * que torna observável a idempotência de um restauro repetido.
 */
function makeMemoryRepo(existing: Task[] = []): ITaskRepository {
  const byId = new Map(existing.map((t) => [t.id, t]));
  return makeRepo({
    findById: vi.fn(async (id: string) => byId.get(id) ?? null),
    save: vi.fn(async (task: Task) => {
      if (byId.has(task.id)) throw new Error(`UNIQUE constraint failed: ${task.id}`);
      byId.set(task.id, task);
    }),
  });
}

describe("restoreTasks", () => {
  it("reinsere o snapshot intacto, com todos os campos", async () => {
    const snapshot = makeTask({
      id: "t-restore",
      billable: false,
      createdAt: localISO(2026, 3, 2, 14, 30),
      updatedAt: localISO(2026, 3, 2, 15, 0),
      plannedTaskId: "pt-origem",
      customValues: { f1: "opt-1", f2: "texto" },
    });
    const repo = makeMemoryRepo();

    const restored = await restoreTasks(repo, [snapshot]);

    expect(repo.save).toHaveBeenCalledWith(snapshot);
    expect(await repo.findById("t-restore")).toEqual(snapshot);
    expect(restored).toEqual([snapshot]);
  });

  it("chamado duas vezes não duplica nem lança", async () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const repo = makeMemoryRepo();

    await restoreTasks(repo, [a, b]);
    const second = await restoreTasks(repo, [a, b]);

    expect(second).toEqual([]);
    expect(repo.save).toHaveBeenCalledTimes(2);
  });

  it("lote parcial restaura só o que não existe e devolve só esse", async () => {
    const existing = makeTask({ id: "ja-existe" });
    const missing = makeTask({ id: "faltando" });
    const repo = makeMemoryRepo([existing]);

    const restored = await restoreTasks(repo, [existing, missing]);

    expect(restored).toEqual([missing]);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(missing);
  });
});

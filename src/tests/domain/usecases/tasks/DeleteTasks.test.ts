import { describe, it, expect, vi } from "vitest";
import { deleteTasks } from "@domain/usecases/tasks/DeleteTasks";
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

/** Repositório que responde `findById` a partir de um mapa, como o banco faria. */
function makeRepoWith(tasks: Task[]): ITaskRepository {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return makeRepo({ findById: vi.fn(async (id: string) => byId.get(id) ?? null) });
}

describe("deleteTasks", () => {
  it("devolve os snapshots com customValues, na ordem dos ids", async () => {
    const a = makeTask({ id: "a", customValues: { f1: "opt-1" } });
    const b = makeTask({ id: "b", customValues: { f2: "texto" }, plannedTaskId: "pt-9" });
    const repo = makeRepoWith([a, b]);

    const snapshots = await deleteTasks(repo, ["b", "a"]);

    expect(snapshots).toEqual([b, a]);
    expect(snapshots[0].customValues).toEqual({ f2: "texto" });
  });

  it("apaga cada id encontrado", async () => {
    const repo = makeRepoWith([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    await deleteTasks(repo, ["a", "b"]);
    expect(repo.delete).toHaveBeenCalledWith("a");
    expect(repo.delete).toHaveBeenCalledWith("b");
  });

  it("lê o snapshot antes de apagar", async () => {
    const repo = makeRepoWith([makeTask({ id: "a" })]);
    await deleteTasks(repo, ["a"]);
    const [lido] = vi.mocked(repo.findById).mock.invocationCallOrder;
    const [apagado] = vi.mocked(repo.delete).mock.invocationCallOrder;
    expect(lido).toBeLessThan(apagado);
  });

  it("ignora id inexistente sem lançar e sem chamar delete para ele", async () => {
    const a = makeTask({ id: "a" });
    const repo = makeRepoWith([a]);

    const snapshots = await deleteTasks(repo, ["sumiu", "a"]);

    expect(snapshots).toEqual([a]);
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.delete).toHaveBeenCalledWith("a");
  });

  it("lista vazia não toca no repositório", async () => {
    const repo = makeRepo();
    expect(await deleteTasks(repo, [])).toEqual([]);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

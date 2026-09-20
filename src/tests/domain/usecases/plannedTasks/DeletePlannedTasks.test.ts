import { describe, it, expect, vi } from "vitest";
import { deletePlannedTasks } from "@domain/usecases/plannedTasks/DeletePlannedTasks";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { localISO } from "../../../helpers/localTime";

function makeRepo(overrides: Partial<IPlannedTaskRepository> = {}): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findAll: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    workspaceId: "ws-1",
    name: "Original",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: localISO(2026, 4, 8, 9),
    customValues: {},
    ...overrides,
  };
}

/** Repositório que responde `findById` a partir de um mapa, como o banco faria. */
function makeRepoWith(tasks: PlannedTask[]): IPlannedTaskRepository {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return makeRepo({ findById: vi.fn(async (id: string) => byId.get(id) ?? null) });
}

describe("deletePlannedTasks", () => {
  it("devolve os snapshots com customValues, na ordem dos ids", async () => {
    const a = makeTask({ id: "a", customValues: { f1: "opt-1" } });
    const b = makeTask({ id: "b", customValues: { f2: "texto" } });
    const repo = makeRepoWith([a, b]);

    const snapshots = await deletePlannedTasks(repo, ["b", "a"]);

    expect(snapshots).toEqual([b, a]);
    expect(snapshots[0].customValues).toEqual({ f2: "texto" });
  });

  it("apaga cada id encontrado", async () => {
    const repo = makeRepoWith([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    await deletePlannedTasks(repo, ["a", "b"]);
    expect(repo.delete).toHaveBeenCalledWith("a");
    expect(repo.delete).toHaveBeenCalledWith("b");
  });

  it("lê o snapshot antes de apagar", async () => {
    const repo = makeRepoWith([makeTask({ id: "a" })]);
    await deletePlannedTasks(repo, ["a"]);
    const [lido] = vi.mocked(repo.findById).mock.invocationCallOrder;
    const [apagado] = vi.mocked(repo.delete).mock.invocationCallOrder;
    expect(lido).toBeLessThan(apagado);
  });

  it("ignora id inexistente sem lançar e sem chamar delete para ele", async () => {
    const a = makeTask({ id: "a" });
    const repo = makeRepoWith([a]);

    const snapshots = await deletePlannedTasks(repo, ["sumiu", "a"]);

    expect(snapshots).toEqual([a]);
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.delete).toHaveBeenCalledWith("a");
  });

  it("lista vazia não toca no repositório", async () => {
    const repo = makeRepo();
    expect(await deletePlannedTasks(repo, [])).toEqual([]);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

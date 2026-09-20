import { describe, it, expect, vi } from "vitest";
import { restorePlannedTasks } from "@domain/usecases/plannedTasks/RestorePlannedTasks";
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

/**
 * Repositório em memória: `save` grava no mapa e `findById` lê dele, que é o
 * que torna observável a idempotência de um restauro repetido.
 */
function makeMemoryRepo(existing: PlannedTask[] = []): IPlannedTaskRepository {
  const byId = new Map(existing.map((t) => [t.id, t]));
  return makeRepo({
    findById: vi.fn(async (id: string) => byId.get(id) ?? null),
    save: vi.fn(async (task: PlannedTask) => {
      if (byId.has(task.id)) throw new Error(`UNIQUE constraint failed: ${task.id}`);
      byId.set(task.id, task);
    }),
  });
}

describe("restorePlannedTasks", () => {
  it("reinsere o snapshot intacto, com todos os campos", async () => {
    const snapshot = makeTask({
      id: "pt-restore",
      sortOrder: 7,
      createdAt: localISO(2026, 3, 2, 14, 30),
      completedDates: ["2026-04-01", "2026-04-03"],
      actions: [{ type: "open_url", value: "https://example.com", label: "Board" }],
      customValues: { f1: "opt-1", f2: "texto" },
      startTime: "09:00",
      endTime: "10:30",
    });
    const repo = makeMemoryRepo();

    const restored = await restorePlannedTasks(repo, [snapshot]);

    expect(repo.save).toHaveBeenCalledWith(snapshot);
    expect(await repo.findById("pt-restore")).toEqual(snapshot);
    expect(restored).toEqual([snapshot]);
  });

  it("chamado duas vezes não duplica nem lança", async () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const repo = makeMemoryRepo();

    await restorePlannedTasks(repo, [a, b]);
    const second = await restorePlannedTasks(repo, [a, b]);

    expect(second).toEqual([]);
    expect(repo.save).toHaveBeenCalledTimes(2);
  });

  it("lote parcial restaura só o que não existe e devolve só esse", async () => {
    const existing = makeTask({ id: "ja-existe" });
    const missing = makeTask({ id: "faltando", sortOrder: 3 });
    const repo = makeMemoryRepo([existing]);

    const restored = await restorePlannedTasks(repo, [existing, missing]);

    expect(restored).toEqual([missing]);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(missing);
  });
});

import { describe, it, expect, vi } from "vitest";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { uncompletePlannedTask } from "@domain/usecases/plannedTasks/UncompletePlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";

function makeRepo(overrides: Partial<IPlannedTaskRepository> = {}): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("completePlannedTask", () => {
  it("chama repo.complete com id e data", async () => {
    const repo = makeRepo();
    await completePlannedTask(repo, "pt1", "2026-04-08");
    expect(repo.complete).toHaveBeenCalledWith("pt1", "2026-04-08");
  });
});

describe("uncompletePlannedTask", () => {
  it("chama repo.uncomplete com id e data", async () => {
    const repo = makeRepo();
    await uncompletePlannedTask(repo, "pt1", "2026-04-08");
    expect(repo.uncomplete).toHaveBeenCalledWith("pt1", "2026-04-08");
  });
});

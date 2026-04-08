import { describe, it, expect, vi } from "vitest";
import { deletePlannedTask } from "@domain/usecases/plannedTasks/DeletePlannedTask";
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

describe("deletePlannedTask", () => {
  it("chama repo.delete com o id correto", async () => {
    const repo = makeRepo();
    await deletePlannedTask(repo, "pt1");
    expect(repo.delete).toHaveBeenCalledWith("pt1");
  });
});

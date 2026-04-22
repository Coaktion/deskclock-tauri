import { describe, it, expect, vi } from "vitest";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";

function makeRepo(): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(),
  };
}

describe("deleteTask", () => {
  it("chama repository.delete com o id correto", async () => {
    const repo = makeRepo();
    await deleteTask(repo, "uuid-delete");
    expect(repo.delete).toHaveBeenCalledWith("uuid-delete");
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });
});

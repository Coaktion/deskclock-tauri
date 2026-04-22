import { describe, it, expect, vi } from "vitest";
import { cancelTask } from "@domain/usecases/tasks/CancelTask";
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

describe("cancelTask", () => {
  it("chama repository.delete com o id correto", async () => {
    const repo = makeRepo();
    await cancelTask(repo, "uuid-cancel");
    expect(repo.delete).toHaveBeenCalledWith("uuid-cancel");
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });
});

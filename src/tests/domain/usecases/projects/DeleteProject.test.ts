import { describe, it, expect, vi } from "vitest";
import { deleteProject } from "@domain/usecases/projects/DeleteProject";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";

function makeRepo(overrides: Partial<IProjectRepository> = {}): IProjectRepository {
  return {
    findAll: vi.fn(async () => []),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("deleteProject", () => {
  it("chama repository.delete com o id correto", async () => {
    const repo = makeRepo();
    await deleteProject(repo, "uuid-123");
    expect(repo.delete).toHaveBeenCalledWith("uuid-123");
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });
});

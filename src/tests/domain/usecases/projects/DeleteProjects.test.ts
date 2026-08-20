import { describe, it, expect, vi } from "vitest";
import { deleteProjects } from "@domain/usecases/projects/DeleteProjects";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";

function makeRepo(overrides: Partial<IProjectRepository> = {}): IProjectRepository {
  return {
    findAll: vi.fn(async () => []),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("deleteProjects", () => {
  it("chama repository.deleteMany com os ids recebidos", async () => {
    const repo = makeRepo();
    await deleteProjects(repo, ["uuid-1", "uuid-2"]);
    expect(repo.deleteMany).toHaveBeenCalledWith(["uuid-1", "uuid-2"]);
    expect(repo.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("não toca no repositório quando a lista está vazia", async () => {
    const repo = makeRepo();
    await deleteProjects(repo, []);
    expect(repo.deleteMany).not.toHaveBeenCalled();
  });
});

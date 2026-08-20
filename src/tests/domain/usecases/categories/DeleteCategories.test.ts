import { describe, it, expect, vi } from "vitest";
import { deleteCategories } from "@domain/usecases/categories/DeleteCategories";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";

function makeRepo(overrides: Partial<ICategoryRepository> = {}): ICategoryRepository {
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

describe("deleteCategories", () => {
  it("chama repository.deleteMany com os ids recebidos", async () => {
    const repo = makeRepo();
    await deleteCategories(repo, ["uuid-1", "uuid-2"]);
    expect(repo.deleteMany).toHaveBeenCalledWith(["uuid-1", "uuid-2"]);
    expect(repo.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("não toca no repositório quando a lista está vazia", async () => {
    const repo = makeRepo();
    await deleteCategories(repo, []);
    expect(repo.deleteMany).not.toHaveBeenCalled();
  });
});

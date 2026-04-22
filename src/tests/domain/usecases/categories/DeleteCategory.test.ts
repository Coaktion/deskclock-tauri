import { describe, it, expect, vi } from "vitest";
import { deleteCategory } from "@domain/usecases/categories/DeleteCategory";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";

function makeRepo(overrides: Partial<ICategoryRepository> = {}): ICategoryRepository {
  return {
    findAll: vi.fn(async () => []),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("deleteCategory", () => {
  it("chama repository.delete com o id correto", async () => {
    const repo = makeRepo();
    await deleteCategory(repo, "uuid-456");
    expect(repo.delete).toHaveBeenCalledWith("uuid-456");
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });
});

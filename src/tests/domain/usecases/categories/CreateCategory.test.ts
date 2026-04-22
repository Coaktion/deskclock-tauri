import { describe, it, expect, vi } from "vitest";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { DomainError, DuplicateNameError } from "@shared/errors";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Category } from "@domain/entities/Category";

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

describe("createCategory", () => {
  it("cria uma categoria billable", async () => {
    const repo = makeRepo();
    const result = await createCategory(repo, "Desenvolvimento", true);
    expect(result.name).toBe("Desenvolvimento");
    expect(result.defaultBillable).toBe(true);
    expect(result.id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledWith(result);
  });

  it("cria uma categoria non-billable", async () => {
    const repo = makeRepo();
    const result = await createCategory(repo, "Reuniões", false);
    expect(result.defaultBillable).toBe(false);
  });

  it("faz trim no nome antes de salvar", async () => {
    const repo = makeRepo();
    const result = await createCategory(repo, "  Dev  ", true);
    expect(result.name).toBe("Dev");
  });

  it("lança DomainError se o nome estiver vazio", async () => {
    const repo = makeRepo();
    await expect(createCategory(repo, "", true)).rejects.toThrow(DomainError);
    await expect(createCategory(repo, "   ", true)).rejects.toThrow(DomainError);
  });

  it("lança DuplicateNameError se o nome já existir", async () => {
    const existing: Category = { id: "abc", name: "Existente", defaultBillable: true };
    const repo = makeRepo({ findByName: vi.fn(async () => existing) });
    await expect(createCategory(repo, "Existente", true)).rejects.toThrow(DuplicateNameError);
  });
});

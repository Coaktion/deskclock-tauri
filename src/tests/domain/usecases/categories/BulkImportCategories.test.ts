import { describe, it, expect, vi } from "vitest";
import { bulkImportCategories } from "@domain/usecases/categories/BulkImportCategories";
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

describe("bulkImportCategories", () => {
  it("linhas sem prefixo criam categorias billable", async () => {
    const repo = makeRepo();
    await bulkImportCategories(repo, "Desenvolvimento\nSuporte");
    const calls = (repo.save as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].defaultBillable).toBe(true);
    expect(calls[1][0].defaultBillable).toBe(true);
  });

  it("linhas com prefixo ! criam categorias non-billable", async () => {
    const repo = makeRepo();
    await bulkImportCategories(repo, "!Reuniões\n!Treinamento");
    const calls = (repo.save as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].name).toBe("Reuniões");
    expect(calls[0][0].defaultBillable).toBe(false);
    expect(calls[1][0].name).toBe("Treinamento");
    expect(calls[1][0].defaultBillable).toBe(false);
  });

  it("linhas mistas respeitam o prefixo individualmente", async () => {
    const repo = makeRepo();
    const result = await bulkImportCategories(repo, "Dev\n!Reuniões\nSuporte");
    expect(result.created).toBe(3);
    const calls = (repo.save as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].defaultBillable).toBe(true);
    expect(calls[1][0].defaultBillable).toBe(false);
    expect(calls[2][0].defaultBillable).toBe(true);
  });

  it("ignora linhas vazias", async () => {
    const repo = makeRepo();
    const result = await bulkImportCategories(repo, "Dev\n\n  \n!Reuniões");
    expect(result.created).toBe(2);
  });

  it("reporta duplicatas em skipped", async () => {
    const existing: Category = { id: "x", name: "Existente", defaultBillable: true };
    const repo = makeRepo({
      findByName: vi.fn(async (n) => (n === "Existente" ? existing : null)),
    });
    const result = await bulkImportCategories(repo, "Novo\nExistente");
    expect(result.created).toBe(1);
    expect(result.skipped).toContain("Existente");
  });
});

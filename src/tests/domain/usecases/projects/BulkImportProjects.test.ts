import { describe, it, expect, vi } from "vitest";
import { bulkImportProjects } from "@domain/usecases/projects/BulkImportProjects";
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

describe("bulkImportProjects", () => {
  it("cria projetos a partir de linhas de texto", async () => {
    const repo = makeRepo();
    const result = await bulkImportProjects(repo, "Alpha\nBeta\nGamma");
    expect(result.created).toBe(3);
    expect(result.skipped).toHaveLength(0);
    expect(repo.save).toHaveBeenCalledTimes(3);
  });

  it("ignora linhas vazias", async () => {
    const repo = makeRepo();
    const result = await bulkImportProjects(repo, "Alpha\n\n  \nBeta");
    expect(result.created).toBe(2);
  });

  it("reporta duplicatas em skipped sem interromper o import", async () => {
    const repo = makeRepo({
      findByName: vi.fn(async (name) => {
        if (name === "Existente") return { id: "x", name: "Existente" };
        return null;
      }),
      save: vi.fn(async () => {}),
    });
    const result = await bulkImportProjects(repo, "Novo\nExistente\nOutro");
    expect(result.created).toBe(2);
    expect(result.skipped).toContain("Existente");
  });

  it("retorna created=0 e skipped vazio para texto vazio", async () => {
    const repo = makeRepo();
    const result = await bulkImportProjects(repo, "");
    expect(result.created).toBe(0);
    expect(result.skipped).toHaveLength(0);
  });
});

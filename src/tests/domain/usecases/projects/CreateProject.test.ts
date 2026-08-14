import { describe, it, expect, vi } from "vitest";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { DomainError, DuplicateNameError } from "@shared/errors";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";

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

describe("createProject", () => {
  it("cria um projeto com nome válido", async () => {
    const repo = makeRepo();
    const result = await createProject(repo, "Meu Projeto", "ws-1");
    expect(result.name).toBe("Meu Projeto");
    expect(result.id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledWith(result);
  });

  it("pega o menor slot de cor livre no workspace", async () => {
    // A cor não vem do id nem do nome: vem do catálogo do workspace, e o slot 1
    // está vago porque um projeto foi excluído.
    const repo = makeRepo({
      findAll: vi.fn(async () => [
        { id: "a", workspaceId: "ws-1", name: "A", colorIndex: 0 },
        { id: "c", workspaceId: "ws-1", name: "C", colorIndex: 2 },
      ]),
    });
    const result = await createProject(repo, "Novo", "ws-1");
    expect(result.colorIndex).toBe(1);
    expect(repo.findAll).toHaveBeenCalledWith("ws-1");
  });

  it("faz trim no nome antes de salvar", async () => {
    const repo = makeRepo();
    const result = await createProject(repo, "  Projeto  ", "ws-1");
    expect(result.name).toBe("Projeto");
  });

  it("lança DomainError se o nome estiver vazio", async () => {
    const repo = makeRepo();
    await expect(createProject(repo, "", "ws-1")).rejects.toThrow(DomainError);
    await expect(createProject(repo, "   ", "ws-1")).rejects.toThrow(DomainError);
  });

  it("lança DuplicateNameError se o nome já existir", async () => {
    const existing: Project = { id: "abc", workspaceId: "ws-1", name: "Existente", colorIndex: 0 };
    const repo = makeRepo({ findByName: vi.fn(async () => existing) });
    await expect(createProject(repo, "Existente", "ws-1")).rejects.toThrow(DuplicateNameError);
  });
});

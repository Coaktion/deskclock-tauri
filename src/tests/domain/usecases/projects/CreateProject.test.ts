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
    ...overrides,
  };
}

describe("createProject", () => {
  it("cria um projeto com nome válido", async () => {
    const repo = makeRepo();
    const result = await createProject(repo, "Meu Projeto");
    expect(result.name).toBe("Meu Projeto");
    expect(result.id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledWith(result);
  });

  it("faz trim no nome antes de salvar", async () => {
    const repo = makeRepo();
    const result = await createProject(repo, "  Projeto  ");
    expect(result.name).toBe("Projeto");
  });

  it("lança DomainError se o nome estiver vazio", async () => {
    const repo = makeRepo();
    await expect(createProject(repo, "")).rejects.toThrow(DomainError);
    await expect(createProject(repo, "   ")).rejects.toThrow(DomainError);
  });

  it("lança DuplicateNameError se o nome já existir", async () => {
    const existing: Project = { id: "abc", name: "Existente" };
    const repo = makeRepo({ findByName: vi.fn(async () => existing) });
    await expect(createProject(repo, "Existente")).rejects.toThrow(DuplicateNameError);
  });
});

import { describe, it, expect, vi } from "vitest";
import { createWorkspace } from "@domain/usecases/workspaces/CreateWorkspace";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { Workspace } from "@domain/entities/Workspace";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { WORKSPACE_COLORS, workspaceColorFor } from "@domain/utils/workspaceColor";

function makeRepo(overrides: Partial<IWorkspaceRepository> = {}): IWorkspaceRepository {
  return {
    findAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

const existente: Workspace = {
  id: "ws-1",
  name: "Pessoal",
  color: "teal",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("createWorkspace", () => {
  it("salva o workspace e devolve com id gerado", async () => {
    const repo = makeRepo();
    const created = await createWorkspace(repo, "Pessoal");

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Pessoal");
    expect(repo.save).toHaveBeenCalledWith(created);
  });

  it("apara espaços do nome", async () => {
    const repo = makeRepo();
    const created = await createWorkspace(repo, "  Pessoal  ");
    expect(created.name).toBe("Pessoal");
  });

  it("deriva a cor do nome quando nenhuma é informada", async () => {
    const repo = makeRepo();
    const created = await createWorkspace(repo, "Pessoal");
    expect(created.color).toBe(workspaceColorFor("Pessoal"));
    expect(WORKSPACE_COLORS).toContain(created.color);
  });

  it("respeita a cor informada pelo usuário", async () => {
    const repo = makeRepo();
    const created = await createWorkspace(repo, "Pessoal", "violet");
    expect(created.color).toBe("violet");
  });

  it("rejeita nome vazio", async () => {
    const repo = makeRepo();
    await expect(createWorkspace(repo, "   ")).rejects.toThrow(DomainError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("rejeita nome duplicado", async () => {
    const repo = makeRepo({ findByName: vi.fn(async () => existente) });
    await expect(createWorkspace(repo, "Pessoal")).rejects.toThrow(DuplicateNameError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

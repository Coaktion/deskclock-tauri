import { describe, it, expect, vi } from "vitest";
import { updateWorkspace } from "@domain/usecases/workspaces/UpdateWorkspace";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { Workspace } from "@domain/entities/Workspace";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { workspaceColorFor } from "@domain/utils/workspaceColor";

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

const outro: Workspace = {
  id: "ws-2",
  name: "Cliente",
  color: "rose",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("updateWorkspace", () => {
  it("atualiza nome e cor derivada", async () => {
    const repo = makeRepo();
    await updateWorkspace(repo, "ws-1", "Cliente");
    expect(repo.update).toHaveBeenCalledWith("ws-1", "Cliente", workspaceColorFor("Cliente"));
  });

  it("respeita a cor informada", async () => {
    const repo = makeRepo();
    await updateWorkspace(repo, "ws-1", "Cliente", "lime");
    expect(repo.update).toHaveBeenCalledWith("ws-1", "Cliente", "lime");
  });

  it("permite renomear mantendo o próprio nome", async () => {
    const repo = makeRepo({ findByName: vi.fn(async () => ({ ...outro, id: "ws-1" })) });
    await updateWorkspace(repo, "ws-1", "Cliente");
    expect(repo.update).toHaveBeenCalled();
  });

  it("rejeita nome já usado por outro workspace", async () => {
    const repo = makeRepo({ findByName: vi.fn(async () => outro) });
    await expect(updateWorkspace(repo, "ws-1", "Cliente")).rejects.toThrow(DuplicateNameError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("rejeita nome vazio", async () => {
    const repo = makeRepo();
    await expect(updateWorkspace(repo, "ws-1", "  ")).rejects.toThrow(DomainError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

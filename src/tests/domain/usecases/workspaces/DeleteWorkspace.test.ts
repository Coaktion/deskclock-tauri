import { describe, it, expect, vi } from "vitest";
import { deleteWorkspace } from "@domain/usecases/workspaces/DeleteWorkspace";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { IWorkspaceDataPort } from "@domain/repositories/IWorkspaceDataPort";
import type { Workspace } from "@domain/entities/Workspace";
import { DomainError } from "@shared/errors";

const alvo: Workspace = {
  id: "ws-1",
  name: "Cliente",
  color: "rose",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const destino: Workspace = {
  id: "ws-2",
  name: "Pessoal",
  color: "teal",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeRepo(overrides: Partial<IWorkspaceRepository> = {}): IWorkspaceRepository {
  return {
    findAll: vi.fn(async () => [alvo, destino]),
    findById: vi.fn(async (id) => [alvo, destino].find((w) => w.id === id) ?? null),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makePort(overrides: Partial<IWorkspaceDataPort> = {}): IWorkspaceDataPort {
  return {
    moveAll: vi.fn(async () => undefined),
    deleteAll: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("deleteWorkspace", () => {
  it("move os dados para o destino antes de excluir", async () => {
    const repo = makeRepo();
    const port = makePort();
    await deleteWorkspace(repo, port, "ws-1", { mode: "move", toWorkspaceId: "ws-2" });

    expect(port.moveAll).toHaveBeenCalledWith("ws-1", "ws-2");
    expect(port.deleteAll).not.toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith("ws-1");
  });

  it("apaga os dados quando esse é o destino escolhido", async () => {
    const repo = makeRepo();
    const port = makePort();
    await deleteWorkspace(repo, port, "ws-1", { mode: "delete" });

    expect(port.deleteAll).toHaveBeenCalledWith("ws-1");
    expect(port.moveAll).not.toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith("ws-1");
  });

  it("rejeita workspace inexistente", async () => {
    const repo = makeRepo();
    const port = makePort();
    await expect(deleteWorkspace(repo, port, "ws-x", { mode: "delete" })).rejects.toThrow(
      DomainError
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("rejeita excluir o último workspace restante", async () => {
    const repo = makeRepo({ findAll: vi.fn(async () => [alvo]) });
    const port = makePort();
    await expect(deleteWorkspace(repo, port, "ws-1", { mode: "delete" })).rejects.toThrow(
      DomainError
    );
    expect(port.deleteAll).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("rejeita mover para o próprio workspace excluído", async () => {
    const repo = makeRepo();
    const port = makePort();
    await expect(
      deleteWorkspace(repo, port, "ws-1", { mode: "move", toWorkspaceId: "ws-1" })
    ).rejects.toThrow(DomainError);
    expect(port.moveAll).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("rejeita destino inexistente", async () => {
    const repo = makeRepo();
    const port = makePort();
    await expect(
      deleteWorkspace(repo, port, "ws-1", { mode: "move", toWorkspaceId: "ws-x" })
    ).rejects.toThrow(DomainError);
    expect(port.moveAll).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("não exclui o workspace se a movimentação dos dados falhar", async () => {
    const repo = makeRepo();
    const port = makePort({
      moveAll: vi.fn(async () => {
        throw new Error("falha no banco");
      }),
    });
    await expect(
      deleteWorkspace(repo, port, "ws-1", { mode: "move", toWorkspaceId: "ws-2" })
    ).rejects.toThrow("falha no banco");
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

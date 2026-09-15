import { describe, it, expect } from "vitest";
import type { Workspace } from "@domain/entities/Workspace";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, makeTask, NOW, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

const ws = (id: string): Workspace => ({ id, name: id, color: "slot-1", createdAt: NOW });

function depsComDoisWorkspaces(running?: Parameters<typeof makeDeps>[0]) {
  const deps = makeDeps(running);
  deps.workspaceRepo.findAll.mockResolvedValue([ws(WS_ATIVO), ws(WS_OUTRO)] as never);
  return deps;
}

describe("workspaces.list e workspaces.getActive", () => {
  it("lista todos marcando o ativo", async () => {
    const deps = depsComDoisWorkspaces();
    const result = await dispatchLocalApiRequest(deps, "workspaces.list", {});
    expect(result.body).toEqual([
      { ...ws(WS_ATIVO), active: true },
      { ...ws(WS_OUTRO), active: false },
    ]);
  });

  it("devolve o workspace ativo", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "workspaces.getActive", {});
    expect(result).toEqual({ status: 200, body: { ...ws(WS_ATIVO), active: true } });
  });
});

describe("workspaces.create e workspaces.update", () => {
  it("cria pelo hook da UI com a cor da paleta", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "workspaces.create", {
      body: { name: "Freelas", color: "violet" },
    });
    expect(result.status).toBe(201);
    expect(deps.workspaces.create).toHaveBeenCalledWith("Freelas", "violet");
    expect(result.body).toMatchObject({ id: "ws-novo", color: "violet", active: false });
  });

  it("sem cor deixa o domínio decidir", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "workspaces.create", { body: { name: "Freelas" } });
    expect(deps.workspaces.create).toHaveBeenCalledWith("Freelas", undefined);
  });

  it("devolve 400 para cor fora da paleta, na criação e na edição", async () => {
    const deps = makeDeps();
    const create = await dispatchLocalApiRequest(deps, "workspaces.create", {
      body: { name: "Freelas", color: "blue" },
    });
    const update = await dispatchLocalApiRequest(deps, "workspaces.update", {
      id: WS_OUTRO,
      body: { name: "Freelas", color: "#ff0000" },
    });
    expect(create.status).toBe(400);
    expect(update.status).toBe(400);
    expect(deps.workspaces.create).not.toHaveBeenCalled();
    expect(deps.workspaces.update).not.toHaveBeenCalled();
  });

  it("repassa o erro de nome duplicado do hook como 409", async () => {
    const deps = makeDeps();
    const { DuplicateNameError } = await import("@shared/errors");
    deps.workspaces.create.mockRejectedValue(new DuplicateNameError('Workspace "X" já existe.'));
    const result = await dispatchLocalApiRequest(deps, "workspaces.create", {
      body: { name: "X" },
    });
    expect(result.status).toBe(409);
  });

  it("atualiza pelo hook da UI", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "workspaces.update", {
      id: WS_OUTRO,
      body: { name: "Outro nome", color: "teal" },
    });
    expect(result.status).toBe(200);
    expect(deps.workspaces.update).toHaveBeenCalledWith(WS_OUTRO, "Outro nome", "teal");
  });

  it("sem cor no corpo preserva a cor atual em vez de recalcular pelo nome", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "workspaces.update", {
      id: WS_OUTRO,
      body: { name: "Outro nome" },
    });
    expect(result.status).toBe(200);
    expect(deps.workspaces.update).toHaveBeenCalledWith(WS_OUTRO, "Outro nome", "slot-1");
  });

  it("devolve 404 ao atualizar workspace inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "workspaces.update", {
      id: "ws-fantasma",
      body: { name: "X" },
    });
    expect(result.status).toBe(404);
    expect(deps.workspaces.update).not.toHaveBeenCalled();
  });
});

describe("workspaces.delete", () => {
  it("move os dados pelo hook da UI", async () => {
    const deps = depsComDoisWorkspaces();
    const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_ATIVO,
      body: { mode: "move", toWorkspaceId: WS_OUTRO },
    });
    expect(result).toEqual({ status: 204, body: null });
    expect(deps.workspaces.remove).toHaveBeenCalledWith(WS_ATIVO, {
      mode: "move",
      toWorkspaceId: WS_OUTRO,
    });
  });

  it("apaga os dados no modo delete", async () => {
    const deps = depsComDoisWorkspaces();
    await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_OUTRO,
      body: { mode: "delete" },
    });
    expect(deps.workspaces.remove).toHaveBeenCalledWith(WS_OUTRO, { mode: "delete" });
  });

  it("devolve 404 para workspace inexistente", async () => {
    const deps = depsComDoisWorkspaces();
    const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: "ws-fantasma",
      body: { mode: "delete" },
    });
    expect(result.status).toBe(404);
  });

  it("devolve 409 ao excluir o último workspace", async () => {
    const deps = makeDeps();
    deps.workspaceRepo.findAll.mockResolvedValue([ws(WS_ATIVO)] as never);
    const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_ATIVO,
      body: { mode: "delete" },
    });
    expect(result).toEqual({
      status: 409,
      body: { error: "Não é possível excluir o último workspace." },
    });
    expect(deps.workspaces.remove).not.toHaveBeenCalled();
  });

  it("devolve 409 para destino inexistente", async () => {
    const deps = depsComDoisWorkspaces();
    const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_OUTRO,
      body: { mode: "move", toWorkspaceId: "ws-fantasma" },
    });
    expect(result.status).toBe(409);
    expect(deps.workspaces.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["move", { mode: "move", toWorkspaceId: WS_ATIVO }],
    ["delete", { mode: "delete" }],
  ])(
    "devolve 409 no modo %s quando a tarefa ativa pertence ao workspace, mesmo pausada",
    async (_modo, body) => {
      const deps = depsComDoisWorkspaces({
        running: { runningTask: makeTask({ workspaceId: WS_OUTRO, status: "paused" }) },
      });
      const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
        id: WS_OUTRO,
        body,
      });
      expect(result.status).toBe(409);
      expect(deps.workspaces.remove).not.toHaveBeenCalled();
    }
  );

  it("permite excluir outro workspace enquanto há tarefa ativa no ativo", async () => {
    const deps = depsComDoisWorkspaces({ running: { runningTask: makeTask() } });
    const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_OUTRO,
      body: { mode: "delete" },
    });
    expect(result.status).toBe(204);
  });

  it("devolve 400 para mode inválido ou move sem destino", async () => {
    const deps = depsComDoisWorkspaces();
    const semModo = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_OUTRO,
      body: { mode: "archive" },
    });
    const semDestino = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_OUTRO,
      body: { mode: "move" },
    });
    expect(semModo.status).toBe(400);
    expect(semDestino.status).toBe(400);
  });
});

describe("workspaces.setActive", () => {
  it("troca pelo switchTo do contexto", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "workspaces.setActive", {
      body: { id: WS_OUTRO },
    });
    expect(deps.workspaces.switchTo).toHaveBeenCalledWith(WS_OUTRO);
    expect(result).toEqual({ status: 200, body: { ...ws(WS_OUTRO), active: true } });
  });

  it("devolve 409 com tarefa ativa e não para a tarefa", async () => {
    const deps = makeDeps({ running: { runningTask: makeTask() } });
    const result = await dispatchLocalApiRequest(deps, "workspaces.setActive", {
      body: { id: WS_OUTRO },
    });
    expect(result.status).toBe(409);
    expect(deps.workspaces.switchTo).not.toHaveBeenCalled();
    expect(deps.running.stopTask).not.toHaveBeenCalled();
  });

  it("trocar para o próprio ativo é no-op, mesmo com tarefa ativa", async () => {
    const deps = makeDeps({ running: { runningTask: makeTask() } });
    const result = await dispatchLocalApiRequest(deps, "workspaces.setActive", {
      body: { id: WS_ATIVO },
    });
    expect(result.status).toBe(200);
    expect(deps.workspaces.switchTo).not.toHaveBeenCalled();
  });

  it("devolve 409 para workspace inexistente e 400 sem id", async () => {
    const deps = makeDeps();
    const fantasma = await dispatchLocalApiRequest(deps, "workspaces.setActive", {
      body: { id: "ws-fantasma" },
    });
    const semId = await dispatchLocalApiRequest(deps, "workspaces.setActive", { body: {} });
    expect(fantasma.status).toBe(409);
    expect(semId.status).toBe(400);
  });
});

describe("workspaces — erros do domínio pelo hook", () => {
  it("delete move para o próprio workspace sai 400", async () => {
    const deps = depsComDoisWorkspaces();
    deps.workspaces.remove.mockRejectedValue(
      new DomainError("O workspace de destino deve ser diferente do excluído.")
    );
    const result = await dispatchLocalApiRequest(deps, "workspaces.delete", {
      id: WS_OUTRO,
      body: { mode: "move", toWorkspaceId: WS_OUTRO },
    });
    expect(result.status).toBe(400);
    expect(deps.workspaces.remove).toHaveBeenCalledWith(WS_OUTRO, {
      mode: "move",
      toWorkspaceId: WS_OUTRO,
    });
  });

  it("update com nome duplicado sai 409", async () => {
    const deps = makeDeps();
    deps.workspaces.update.mockRejectedValue(new DuplicateNameError("Workspace já existe."));
    const result = await dispatchLocalApiRequest(deps, "workspaces.update", {
      id: WS_OUTRO,
      body: { name: WS_ATIVO },
    });
    expect(result.status).toBe(409);
  });
});

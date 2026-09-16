import { describe, it, expect } from "vitest";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

describe("projects.list e categories.list", () => {
  it("lista projetos do workspace ativo com workspaceId e colorIndex no DTO", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.list", {});
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
    expect(result).toEqual({
      status: 200,
      body: [{ id: "proj-ativo", workspaceId: WS_ATIVO, name: "Cliente", colorIndex: 0 }],
    });
  });

  it("lista categorias do workspace informado", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "categories.list", {
      workspaceId: WS_OUTRO,
    });
    expect(deps.categoryRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(result.body).toEqual([
      { id: "cat-ativo", workspaceId: WS_ATIVO, name: "Reuniões", defaultBillable: false },
    ]);
  });

  it("devolve 409 para workspace inexistente", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "projects.list", {
      workspaceId: "ws-fantasma",
    });
    expect(result.status).toBe(409);
  });
});

describe("projects.create", () => {
  it("cria no workspace ativo com a cor do domínio e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.create", {
      body: { name: "  Novo  " },
    });
    const saved = deps.projectRepo.save.mock.calls[0][0] as unknown as Project;
    expect(result.status).toBe(201);
    expect(saved).toMatchObject({ workspaceId: WS_ATIVO, name: "Novo" });
    expect(saved.colorIndex).not.toBe(0);
    expect(result.body).toEqual({
      id: saved.id,
      workspaceId: WS_ATIVO,
      name: "Novo",
      colorIndex: saved.colorIndex,
    });
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
  });

  it("cria no workspace informado", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "projects.create", {
      body: { name: "Novo", workspaceId: WS_OUTRO },
    });
    expect(deps.projectRepo.findByName).toHaveBeenCalledWith("Novo", WS_OUTRO);
    expect(deps.projectRepo.save.mock.calls[0][0]).toMatchObject({ workspaceId: WS_OUTRO });
  });

  it("devolve 409 para nome duplicado e não avisa", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.create", {
      body: { name: "Cliente" },
    });
    expect(result.status).toBe(409);
    expect(deps.projectRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyProjectsChanged).not.toHaveBeenCalled();
  });

  it("devolve 400 para nome vazio", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "projects.create", {
      body: { name: "  " },
    });
    expect(result.status).toBe(400);
  });

  it("devolve 409 para workspace inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.create", {
      body: { name: "Novo", workspaceId: "ws-fantasma" },
    });
    expect(result.status).toBe(409);
    expect(deps.projectRepo.save).not.toHaveBeenCalled();
  });
});

describe("projects.update e projects.delete", () => {
  it("renomeia o projeto do workspace ativo e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.update", {
      id: "proj-ativo",
      body: { name: "Renomeado" },
    });
    expect(result.status).toBe(200);
    expect(deps.projectRepo.update).toHaveBeenCalledWith("proj-ativo", "Renomeado");
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
  });

  it("devolve 404 para projeto que não está no workspace informado", async () => {
    const deps = makeDeps();
    deps.projectRepo.findAll.mockResolvedValueOnce([]);
    const result = await dispatchLocalApiRequest(deps, "projects.update", {
      id: "proj-ativo",
      workspaceId: WS_OUTRO,
      body: { name: "Renomeado" },
    });
    expect(result.status).toBe(404);
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(deps.projectRepo.update).not.toHaveBeenCalled();
    expect(deps.notifyProjectsChanged).not.toHaveBeenCalled();
  });

  it("devolve 409 ao renomear para o nome de outro projeto", async () => {
    const deps = makeDeps();
    deps.projectRepo.findAll.mockResolvedValue([
      { id: "proj-ativo", workspaceId: WS_ATIVO, name: "Cliente", colorIndex: 0 },
      { id: "proj-2", workspaceId: WS_ATIVO, name: "Outro", colorIndex: 1 },
    ]);
    const result = await dispatchLocalApiRequest(deps, "projects.update", {
      id: "proj-2",
      body: { name: "Cliente" },
    });
    expect(result.status).toBe(409);
  });

  it("exclui e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.delete", { id: "proj-ativo" });
    expect(result).toEqual({ status: 204, body: null });
    expect(deps.projectRepo.delete).toHaveBeenCalledWith("proj-ativo");
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
  });

  it("devolve 404 ao excluir id de outro workspace", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.delete", { id: "proj-de-outro" });
    expect(result.status).toBe(404);
    expect(deps.projectRepo.delete).not.toHaveBeenCalled();
  });
});

describe("projects.import e projects.deleteMany", () => {
  it("importa uma linha por projeto, pula os repetidos e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.import", {
      body: { text: "Novo\n\nCliente", workspaceId: WS_ATIVO },
    });
    expect(result).toEqual({ status: 200, body: { created: 1, skipped: ["Cliente"] } });
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
  });

  it("exclui em lote os ids do workspace", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.deleteMany", {
      body: { ids: ["proj-ativo"] },
    });
    expect(result.status).toBe(204);
    expect(deps.projectRepo.deleteMany).toHaveBeenCalledWith(["proj-ativo"]);
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
  });

  it("não exclui nada se algum id não estiver no workspace", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.deleteMany", {
      body: { ids: ["proj-ativo", "proj-de-outro"] },
    });
    expect(result).toEqual({
      status: 404,
      body: { error: "Projetos não encontrados no workspace: proj-de-outro" },
    });
    expect(deps.projectRepo.deleteMany).not.toHaveBeenCalled();
  });
});

describe("categorias", () => {
  it("cria billable por padrão e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "categories.create", {
      body: { name: "Dev" },
    });
    expect(result.status).toBe(201);
    expect(deps.categoryRepo.save.mock.calls[0][0]).toMatchObject({
      workspaceId: WS_ATIVO,
      name: "Dev",
      defaultBillable: true,
    });
    expect(deps.notifyCategoriesChanged).toHaveBeenCalled();
  });

  it("cria não billable no workspace informado", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "categories.create", {
      body: { name: "Interna", defaultBillable: false, workspaceId: WS_OUTRO },
    });
    expect(deps.categoryRepo.save.mock.calls[0][0]).toMatchObject({
      workspaceId: WS_OUTRO,
      defaultBillable: false,
    });
  });

  it("devolve 409 para nome duplicado", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "categories.create", {
      body: { name: "Reuniões" },
    });
    expect(result.status).toBe(409);
    expect(deps.notifyCategoriesChanged).not.toHaveBeenCalled();
  });

  it("atualiza preservando defaultBillable quando ausente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "categories.update", {
      id: "cat-ativo",
      body: { name: "Reuniões internas" },
    });
    expect(result.status).toBe(200);
    expect(deps.categoryRepo.update).toHaveBeenCalledWith("cat-ativo", "Reuniões internas", false);
    expect(deps.notifyCategoriesChanged).toHaveBeenCalled();
  });

  it("devolve 404 ao atualizar ou excluir categoria fora do workspace", async () => {
    const deps = makeDeps();
    const update = await dispatchLocalApiRequest(deps, "categories.update", {
      id: "cat-de-outro",
      body: { name: "X" },
    });
    const remove = await dispatchLocalApiRequest(deps, "categories.delete", { id: "cat-de-outro" });
    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(deps.categoryRepo.delete).not.toHaveBeenCalled();
  });

  it("exclui e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "categories.delete", { id: "cat-ativo" });
    expect(result.status).toBe(204);
    expect(deps.categoryRepo.delete).toHaveBeenCalledWith("cat-ativo");
    expect(deps.notifyCategoriesChanged).toHaveBeenCalled();
  });

  it("importa com '!' marcando não billable", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "categories.import", {
      body: { text: "Dev\n!Interna" },
    });
    const saved = deps.categoryRepo.save.mock.calls.map((c) => c[0] as unknown as Category);
    expect(result.body).toEqual({ created: 2, skipped: [] });
    expect(saved.map((c) => [c.name, c.defaultBillable])).toEqual([
      ["Dev", true],
      ["Interna", false],
    ]);
    expect(deps.notifyCategoriesChanged).toHaveBeenCalled();
  });

  it("exclui em lote e recusa id de outro workspace", async () => {
    const deps = makeDeps();
    const ok = await dispatchLocalApiRequest(deps, "categories.deleteMany", {
      body: { ids: ["cat-ativo"] },
    });
    const erro = await dispatchLocalApiRequest(deps, "categories.deleteMany", {
      body: { ids: ["cat-x"] },
    });
    expect(ok.status).toBe(204);
    expect(erro.status).toBe(404);
    expect(deps.categoryRepo.deleteMany).toHaveBeenCalledTimes(1);
    expect(deps.notifyCategoriesChanged).toHaveBeenCalledTimes(1);
  });
});

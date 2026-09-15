import { describe, it, expect } from "vitest";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

const ASSOCIACAO = {
  projectId: "proj-ativo",
  categoryId: "cat-ativo",
  source: "manual" as const,
  createdAt: localISO(2026, 9, 1, 8),
};

describe("projectCategories.list", () => {
  it("lista as associações do projeto do workspace ativo", async () => {
    const deps = makeDeps();
    deps.projectCategoryRepo.findByProject.mockResolvedValue([ASSOCIACAO]);
    const result = await dispatchLocalApiRequest(deps, "projectCategories.list", {
      id: "proj-ativo",
    });
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
    expect(result).toEqual({
      status: 200,
      body: [{ categoryId: "cat-ativo", source: "manual", createdAt: ASSOCIACAO.createdAt }],
    });
  });

  it("devolve 404 quando o projeto não está no workspace informado", async () => {
    const deps = makeDeps();
    deps.projectRepo.findAll.mockResolvedValueOnce([]);
    const result = await dispatchLocalApiRequest(deps, "projectCategories.list", {
      id: "proj-ativo",
      workspaceId: WS_OUTRO,
    });
    expect(result.status).toBe(404);
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
  });
});

describe("projectCategories.set", () => {
  it("grava a seleção sem repetição e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.projectCategoryRepo.findByProject.mockResolvedValue([ASSOCIACAO]);
    const result = await dispatchLocalApiRequest(deps, "projectCategories.set", {
      id: "proj-ativo",
      body: { categoryIds: ["cat-ativo", "cat-ativo"] },
    });
    expect(result.status).toBe(200);
    expect(deps.projectCategoryRepo.setForProject).toHaveBeenCalledWith("proj-ativo", [
      "cat-ativo",
    ]);
    expect(deps.notifyProjectCategoriesChanged).toHaveBeenCalled();
  });

  it("lista vazia remove o filtro", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "projectCategories.set", {
      id: "proj-ativo",
      body: { categoryIds: [] },
    });
    expect(deps.projectCategoryRepo.setForProject).toHaveBeenCalledWith("proj-ativo", []);
  });

  it("devolve 409 para categoria de outro workspace e não grava", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projectCategories.set", {
      id: "proj-ativo",
      body: { categoryIds: ["cat-ativo", "cat-de-outro"] },
    });
    expect(result).toEqual({
      status: 409,
      body: { error: "Categorias não encontradas no workspace do projeto: cat-de-outro" },
    });
    expect(deps.projectCategoryRepo.setForProject).not.toHaveBeenCalled();
    expect(deps.notifyProjectCategoriesChanged).not.toHaveBeenCalled();
  });

  it("devolve 404 para projeto inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projectCategories.set", {
      id: "proj-x",
      body: { categoryIds: [] },
    });
    expect(result.status).toBe(404);
    expect(deps.projectCategoryRepo.setForProject).not.toHaveBeenCalled();
  });
});

describe("projectCategories.set com workspaceId explícito", () => {
  it("valida as categorias no workspace do projeto", async () => {
    const deps = makeDeps();
    deps.projectRepo.findAll.mockResolvedValue([
      { id: "proj-outro", workspaceId: WS_OUTRO, name: "Outro", colorIndex: 1 },
    ]);
    deps.categoryRepo.findAll.mockResolvedValue([
      { id: "cat-outro", workspaceId: WS_OUTRO, name: "Dev", defaultBillable: true },
    ]);
    const result = await dispatchLocalApiRequest(deps, "projectCategories.set", {
      id: "proj-outro",
      workspaceId: WS_OUTRO,
      body: { categoryIds: ["cat-outro"] },
    });
    expect(result.status).toBe(200);
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(deps.categoryRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(deps.projectCategoryRepo.setForProject).toHaveBeenCalledWith("proj-outro", [
      "cat-outro",
    ]);
  });
});

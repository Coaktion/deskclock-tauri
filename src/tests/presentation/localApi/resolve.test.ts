import { describe, it, expect } from "vitest";
import {
  findCategoryInWorkspace,
  findProjectInWorkspace,
  resolveCatalogPatch,
  resolveCategoryId,
  resolveProjectId,
} from "@presentation/localApi/resolve";
import { ConflictError, NotFoundError } from "@presentation/localApi/errors";
import { makeDeps, WS_ATIVO, WS_OUTRO } from "./fakeDeps";

describe("resolveCategoryId", () => {
  it("recusa com 409 o id de categoria que não pertence ao workspace", async () => {
    const deps = makeDeps();
    await expect(resolveCategoryId(deps, WS_ATIVO, "cat-de-outro", null)).rejects.toThrow(
      new ConflictError("Categoria com id 'cat-de-outro' não encontrada no workspace")
    );
    expect(deps.categoryRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
  });

  it("recusa com 409 o nome de categoria que não existe no workspace", async () => {
    const deps = makeDeps();
    await expect(resolveCategoryId(deps, WS_OUTRO, null, "Reuniões")).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(deps.categoryRepo.findByName).toHaveBeenCalledWith("Reuniões", WS_OUTRO);
  });

  it("aceita id e nome que existem no workspace", async () => {
    const deps = makeDeps();
    await expect(resolveCategoryId(deps, WS_ATIVO, "cat-ativo", null)).resolves.toBe("cat-ativo");
    await expect(resolveCategoryId(deps, WS_ATIVO, null, "Reuniões")).resolves.toBe("cat-ativo");
  });

  it("sem id nem nome devolve null", async () => {
    await expect(resolveCategoryId(makeDeps(), WS_ATIVO, null, null)).resolves.toBeNull();
  });
});

describe("resolveProjectId", () => {
  it("sem id nem nome devolve null", async () => {
    await expect(resolveProjectId(makeDeps(), WS_ATIVO, null, null)).resolves.toBeNull();
  });
});

describe("findProjectInWorkspace e findCategoryInWorkspace", () => {
  it("devolvem o item do workspace e recusam com 404 o de fora", async () => {
    const deps = makeDeps();
    await expect(findProjectInWorkspace(deps, WS_ATIVO, "proj-ativo")).resolves.toMatchObject({
      name: "Cliente",
    });
    await expect(findCategoryInWorkspace(deps, WS_ATIVO, "cat-x")).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(deps.categoryRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
  });
});

describe("resolveCatalogPatch", () => {
  it("só inclui o que o corpo trouxe, e null limpa", async () => {
    const deps = makeDeps();
    await expect(resolveCatalogPatch(deps, WS_ATIVO, { name: "x" } as never)).resolves.toEqual({});
    await expect(
      resolveCatalogPatch(deps, WS_ATIVO, { projectId: null, categoryName: "Reuniões" })
    ).resolves.toEqual({ projectId: null, categoryId: "cat-ativo" });
  });
});

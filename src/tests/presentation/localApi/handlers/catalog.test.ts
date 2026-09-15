import { describe, it, expect } from "vitest";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

describe("projects.list e categories.list", () => {
  it("lista projetos do workspace ativo com workspaceId no DTO", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "projects.list", {});
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
    expect(result).toEqual({
      status: 200,
      body: [{ id: "proj-ativo", workspaceId: WS_ATIVO, name: "Cliente" }],
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
});

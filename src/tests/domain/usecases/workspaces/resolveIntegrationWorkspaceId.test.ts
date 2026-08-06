import { describe, it, expect } from "vitest";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";

describe("resolveIntegrationWorkspaceId", () => {
  it("devolve o workspace escolhido para a integração", () => {
    expect(resolveIntegrationWorkspaceId("ws-trabalho")).toBe("ws-trabalho");
  });

  it("cai no workspace Padrão quando a integração não escolheu nenhum", () => {
    expect(resolveIntegrationWorkspaceId("")).toBe(DEFAULT_WORKSPACE_ID);
  });

  it("trata a config ausente como não escolhida — a chave nasce depois do resto", () => {
    expect(resolveIntegrationWorkspaceId(undefined)).toBe(DEFAULT_WORKSPACE_ID);
  });
});

import { describe, it, expect, vi } from "vitest";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { IIntegrationWorkspacePort } from "@domain/integrations/IIntegrationWorkspacePort";
import { integrationsBoundToWorkspace } from "@domain/usecases/workspaces/integrationsBoundToWorkspace";
import type { AppConfig } from "@shared/types/appConfig";

function makeConfig(overrides: Partial<AppConfig> = {}): IIntegrationWorkspacePort {
  const values: Partial<AppConfig> = {
    mondayApiKey: "token",
    clockifyApiKey: "token",
    googleRefreshToken: "token",
    zendeskAccessToken: "token",
    mondayDeskclockWorkspaceId: "",
    clockifyDeskclockWorkspaceId: "",
    sheetsDeskclockWorkspaceId: "",
    calendarDeskclockWorkspaceId: "",
    zendeskDeskclockWorkspaceId: "",
    ...overrides,
  };
  return { get: vi.fn((key: keyof AppConfig) => values[key]) as IIntegrationWorkspacePort["get"] };
}

describe("integrationsBoundToWorkspace", () => {
  it("aponta a integração que escolheu este workspace", () => {
    const bound = integrationsBoundToWorkspace(
      makeConfig({ mondayDeskclockWorkspaceId: "ws-trabalho" }),
      "ws-trabalho"
    );

    expect(bound.map((b) => b.label)).toEqual(["Monday"]);
    expect(bound[0].implicit).toBe(false);
  });

  it("não aponta integração que trabalha em outro workspace", () => {
    const bound = integrationsBoundToWorkspace(
      makeConfig({ mondayDeskclockWorkspaceId: "ws-trabalho" }),
      "ws-pessoal"
    );

    expect(bound).toEqual([]);
  });

  // O caso que a config não mostra: chave vazia resolve para o "Padrão", então
  // apagá-lo quebra integração que nunca nomeou workspace nenhum.
  it("aponta, ao excluir o Padrão, a integração que nunca escolheu workspace", () => {
    const bound = integrationsBoundToWorkspace(makeConfig(), DEFAULT_WORKSPACE_ID);

    expect(bound.map((b) => b.label)).toEqual([
      "Monday",
      "Clockify",
      "Google Sheets",
      "Google Agenda",
      "Zendesk",
    ]);
    expect(bound.every((b) => b.implicit)).toBe(true);
  });

  it("não conta como implícita a integração que escolheu o Padrão de propósito", () => {
    const bound = integrationsBoundToWorkspace(
      makeConfig({ mondayDeskclockWorkspaceId: DEFAULT_WORKSPACE_ID }),
      DEFAULT_WORKSPACE_ID
    );

    expect(bound.find((b) => b.label === "Monday")?.implicit).toBe(false);
  });

  // Avisar sobre integração que ninguém conectou é alarme falso, e alarme falso
  // ensina a ignorar o aviso — que aqui é a única defesa contra a quebra.
  it("ignora integração não conectada", () => {
    const bound = integrationsBoundToWorkspace(
      makeConfig({ mondayApiKey: "", clockifyApiKey: "", zendeskAccessToken: "" }),
      DEFAULT_WORKSPACE_ID
    );

    expect(bound.map((b) => b.label)).toEqual(["Google Sheets", "Google Agenda"]);
  });

  it("o token do Google responde pelas duas integrações que ele destrava", () => {
    const bound = integrationsBoundToWorkspace(
      makeConfig({ googleRefreshToken: "" }),
      DEFAULT_WORKSPACE_ID
    );

    expect(bound.map((b) => b.label)).toEqual(["Monday", "Clockify", "Zendesk"]);
  });
});

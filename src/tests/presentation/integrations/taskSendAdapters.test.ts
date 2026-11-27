import { describe, it, expect, vi } from "vitest";
import type { Task } from "@domain/entities/Task";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import { buildTaskSendAdapter } from "@presentation/integrations/taskSendAdapters";
import { localISO } from "../../helpers/localTime";

function makeConfig(values: Record<string, unknown>, isLoaded = true) {
  return {
    isLoaded,
    loadError: null,
    get: vi.fn((key: string) => values[key]),
    set: vi.fn(async () => {}),
  } as unknown as ConfigContextValue & { set: ReturnType<typeof vi.fn> };
}

const sender = { integrationName: "x", send: vi.fn() };
const factories = {
  createSheetsTaskSender: vi.fn(() => sender),
  createClockifyTaskSender: vi.fn(() => sender),
  createMondayTaskSender: vi.fn(() => sender),
} as unknown as IntegrationFactories;

const CATALOGS = {
  projects: [{ id: "p1", workspaceId: "ws-m", name: "Cliente", colorIndex: 0 }],
  categories: [],
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-m",
    name: "Tarefa",
    projectId: "p1",
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 9, 15, 9),
    endTime: localISO(2026, 9, 15, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 9, 15, 9),
    updatedAt: localISO(2026, 9, 15, 10),
    customValues: {},
    ...overrides,
  };
}

describe("buildTaskSendAdapter", () => {
  it("sem credencial o sender é null e a mensagem é a do modal", () => {
    const config = makeConfig({ clockifyApiKey: "k", clockifyActiveWorkspaceId: "" });
    const adapter = buildTaskSendAdapter("clockify", config, factories, CATALOGS);
    expect(adapter.sender).toBeNull();
    expect(adapter.notConfiguredMessage).toBe(
      "Clockify não configurado. Verifique API Key e workspace."
    );
  });

  it("config não carregada: sender null e workspace Padrão", () => {
    const adapter = buildTaskSendAdapter(
      "google_sheets",
      makeConfig({}, false),
      factories,
      CATALOGS
    );
    expect(adapter.sender).toBeNull();
    expect(adapter.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
  });

  it("Monday: workspace da integração, carga crua, escrita forçada e board mapeado exigido", async () => {
    const config = makeConfig({
      mondayApiKey: "tok",
      mondayDeskclockWorkspaceId: "ws-m",
      mondayProjectMapping: [{ deskclockProjectId: "p2", mondayBoardId: "b" }],
    });
    const adapter = buildTaskSendAdapter("monday", config, factories, CATALOGS);

    expect(adapter.integrationId).toBe("monday");
    expect(adapter.workspaceId).toBe("ws-m");
    expect(adapter.sendsRawTasks).toBe(true);
    expect(factories.createMondayTaskSender).toHaveBeenCalledWith({ forceWrite: true });
    expect(adapter.validateBeforeSend?.([makeTask()])).toBe(
      "Projeto(s) sem board mapeado no Monday: Cliente."
    );
    expect(adapter.validateBeforeSend?.([makeTask({ projectId: "p2" })])).toBeNull();

    await adapter.onSendSuccess(["t1"]);
    expect(config.set).toHaveBeenCalledWith("mondayDailySyncLastTimestamp", expect.any(String));
  });

  it("Sheets: campos obrigatórios do mapeamento barram o envio", () => {
    const config = makeConfig({
      integrationGoogleSheetsSpreadsheetId: "sheet",
      googleRefreshToken: "r",
      integrationGoogleSheetsColumnMapping: [{ field: "category", enabled: true }],
    });
    const adapter = buildTaskSendAdapter("google_sheets", config, factories, CATALOGS);
    expect(adapter.sender).toBe(sender);
    expect(adapter.validateBeforeSend?.([makeTask()])).toBe(
      'Dados incompletos:\n"Tarefa" — faltam: categoria'
    );
  });
});

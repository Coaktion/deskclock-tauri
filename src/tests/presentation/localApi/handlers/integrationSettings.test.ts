import { describe, expect, it, vi } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { AppConfig, ConfigKey } from "@shared/types/appConfig";
import { DEFAULT_COLUMN_MAPPING } from "@shared/types/sheetsConfig";
import { EMPTY_FIELD_CATALOGS } from "@shared/types/mondayConfig";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import type { LocalApiParams } from "@presentation/localApi/types";
import {
  buildIntegrationSettingsPort,
  type IntegrationSettingsDeps,
} from "@presentation/settings/integrationSettingsPort";
import { makeDeps, NOW, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

// Valores de segredo marcados: nenhum deles pode aparecer numa resposta.
const SECRETS: Partial<AppConfig> = {
  googleAccessToken: "SECRET-google-access",
  googleRefreshToken: "SECRET-google-refresh",
  zendeskClientSecret: "SECRET-zendesk-client",
  zendeskAccessToken: "SECRET-zendesk-access",
  zendeskRefreshToken: "SECRET-zendesk-refresh",
  clockifyApiKey: "SECRET-clockify-key",
  mondayApiKey: "SECRET-monday-key",
  llmApiKey: "SECRET-llm-key",
  llmBaseUrl: "https://gateway.local/v1?key=SECRET-llm-url",
};

// Estado interno e dados da conta, marcados: também não podem sair.
const INTERNAL: Partial<AppConfig> = {
  googleTokenExpiry: 424242,
  googleUserEmail: "INTERNAL-ana@exemplo.com",
  sheetsDailySyncLastTimestamp: "INTERNAL-sheets-ts",
  sheetsAutoSyncLastFiredDate: "INTERNAL-sheets-fired",
  calendarLastSyncError: "INTERNAL-calendar-error",
  driveBackupFolderId: "INTERNAL-folder",
  driveBackupLastError: "INTERNAL-backup-error",
  zendeskSubdomain: "INTERNAL-subdomain",
  zendeskClientId: "INTERNAL-client-id",
  zendeskUserEmail: "INTERNAL-zendesk@exemplo.com",
  clockifyUserEmail: "INTERNAL-clockify@exemplo.com",
  clockifyUserId: "INTERNAL-clockify-user",
  clockifyDailySyncLastTimestamp: "INTERNAL-clockify-ts",
  clockifyAutoSyncLastFiredDate: "INTERNAL-clockify-fired",
  mondayUserId: "INTERNAL-monday-user",
  mondayUserName: "INTERNAL-monday-name",
  mondayUserEmail: "INTERNAL-monday@exemplo.com",
  mondayReportTypeFieldId: "INTERNAL-report-type",
  mondayDailySyncLastTimestamp: "INTERNAL-monday-ts",
  mondayAutoSyncLastFiredDate: "INTERNAL-monday-fired",
  mondayProjectsSyncLastDate: "INTERNAL-projects-date",
  mondayProjectsLastSyncError: "INTERNAL-projects-error",
  llmLastLimitsAt: "INTERNAL-limits-at",
  llmLastLimits: { requestsReset: "INTERNAL-reset" },
};

const stageField: CustomField = {
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  options: [{ id: "o1", label: "Discovery" }],
  sortOrder: 0,
  archived: false,
  createdAt: NOW,
};

function baseConfig(): Partial<AppConfig> {
  return {
    ...SECRETS,
    ...INTERNAL,
    sheetsDeskclockWorkspaceId: "",
    integrationGoogleSheetsSpreadsheetId: "planilha",
    integrationGoogleSheetsSheetName: "",
    integrationGoogleSheetsColumnMapping: DEFAULT_COLUMN_MAPPING,
    integrationGoogleSheetsDurationFormat: "HH:MM",
    integrationGoogleSheetsAutoSync: true,
    sheetsAutoSyncMode: "daily",
    sheetsAutoSyncTrigger: "on-open",
    sheetsAutoSyncTime: "18:00",
    sheetsDailySyncLastTimestamp: "2026-09-14T18:00:00Z",
    calendarDeskclockWorkspaceId: WS_OUTRO,
    calendarAutoTrackingEnabled: false,
    calendarIgnoreRules: [{ operator: "equals", value: "Daily" }],
    driveBackupEnabled: false,
    driveBackupFrequency: "weekly",
    driveBackupFolderId: "pasta-interna",
    clockifyDeskclockWorkspaceId: "",
    clockifyActiveWorkspaceId: "cw-1",
    clockifyActiveWorkspaceName: "Aktie",
    clockifyWorkspaceCache: [
      { id: "cw-1", name: "Aktie" },
      { id: "cw-2", name: "Pessoal" },
      { id: "INTERNAL-cw", name: "INTERNAL-cache" },
    ],
    clockifyDefaultTagIds: [],
    clockifyProjectMapping: [
      {
        deskclockProjectId: "proj-ativo",
        clockifyProjectId: "cp-1",
        clockifyProjectName: "Acme - Portal",
        workspaceId: "cw-1",
      },
    ],
    clockifyCategoryMapping: [],
    clockifyAutoSync: false,
    clockifyAutoSyncMode: "per-task",
    clockifyAutoSyncTrigger: "on-open",
    clockifyAutoSyncTime: "18:00",
    mondayDeskclockWorkspaceId: "",
    mondayPortfolioBoardId: "100",
    mondayReportBoardId: "200",
    mondayAutoImportEnabled: false,
    mondayProjectStageFieldId: "",
    mondayNonBillableReasonFieldId: "",
    mondayFieldCatalogs: { ...EMPTY_FIELD_CATALOGS, projectStage: ["Discovery", "Build"] },
    mondayProjectMapping: [
      {
        deskclockProjectId: "proj-ativo",
        portfolioItemId: "item-1",
        mondayBoardId: "",
        scope: "cliente",
        activitiesGroupId: "INTERNAL-group",
        columnIds: { reportedHours: "INTERNAL-col", activityType: "INTERNAL-col", person: "x" },
        activityTypeLabels: ["INTERNAL-label"],
      } as AppConfig["mondayProjectMapping"][number],
    ],
    mondayAutoSync: true,
    mondayAutoSyncMode: "per-task",
    mondayAutoSyncTrigger: "on-open",
    mondayAutoSyncTime: "18:00",
    zendeskDeskclockWorkspaceId: "",
    llmProviderId: "groq",
    llmModel: "llama",
  };
}

function setup(overrides: Partial<AppConfig> = {}) {
  const values: Partial<AppConfig> = { ...baseConfig(), ...overrides };
  const config = {
    get: vi.fn((key: ConfigKey) => values[key]),
    set: vi.fn(async (key: ConfigKey, value: unknown) => {
      (values as Record<string, unknown>)[key] = value;
    }),
  };
  const clockifyApi = {
    listWorkspaces: vi.fn(async () => [{ id: "cw-3", name: "Novo" }]),
    listProjects: vi.fn(async () => [{ id: "cp-2", name: "Suporte", clientName: "Beta" }]),
    listTags: vi.fn(async () => [{ id: "t-1", name: "Dev" }]),
  };
  const mondayApi = {
    getBoardSchema: vi.fn(async (): Promise<never> => {
      throw new Error("Board 999 não encontrado.");
    }),
  };
  const deps = makeDeps();
  let fields: CustomField[] = [];
  deps.customFieldRepo.findAll.mockImplementation(async () => fields);
  deps.customFieldRepo.findByLabel.mockImplementation(async () => null);
  deps.customFieldRepo.save.mockImplementation(async (field: CustomField) => {
    fields = [...fields, field];
  });
  const runDailyFor = vi.fn(
    async (_name: string, _end: string): Promise<AutoSyncResult | null> => ({
      integration: "google_sheets",
      count: 3,
    })
  );
  const portDeps: IntegrationSettingsDeps = {
    config: config as unknown as IntegrationSettingsDeps["config"],
    factories: {
      createClockifyApi: () => clockifyApi as never,
      createMondayApi: () => mondayApi as never,
    },
    projectRepo: deps.projectRepo,
    categoryRepo: deps.categoryRepo,
    customFieldRepo: deps.customFieldRepo,
    notifyProjectsChanged: deps.notifyProjectsChanged,
    notifyCategoriesChanged: deps.notifyCategoriesChanged,
    notifyCustomFieldsChanged: deps.notifyCustomFieldsChanged,
    autoSyncNames: { google_sheets: "google_sheets", monday: "monday" },
    runDailyFor,
    nowISO: () => NOW,
    todayISO: () => TODAY,
  };
  Object.assign(deps, { integrationSettings: buildIntegrationSettingsPort(portDeps) });
  const call = (op: string, params: LocalApiParams = {}) =>
    dispatchLocalApiRequest(deps, op, params);
  const setFields = (next: CustomField[]) => {
    fields = next;
  };
  return { values, config, deps, call, clockifyApi, mondayApi, runDailyFor, setFields };
}

const READ_OPS = [
  "settings.getSheets",
  "settings.getCalendar",
  "settings.getDriveBackup",
  "settings.getClockify",
  "settings.getMonday",
  "settings.getZendesk",
  "settings.getLlm",
];

describe("ajustes das integrações — nenhum segredo sai", () => {
  it("nenhuma leitura traz chave, token, client secret, URL do provedor ou e-mail", async () => {
    const { call } = setup();
    for (const op of READ_OPS) {
      const result = await call(op);
      expect(result.status, op).toBe(200);
      const text = JSON.stringify(result.body);
      expect(text, op).not.toContain("SECRET");
      expect(text, op).not.toMatch(/apiKey|token|secret|baseUrl|email/i);
      expect(text, op).not.toContain("ana@exemplo.com");
      expect((result.body as { connected: unknown }).connected, op).toBe(true);
    }
  });

  it("nem as escritas, que devolvem o grupo", async () => {
    const { call } = setup();
    const writes: [string, unknown][] = [
      ["settings.updateSheets", { sheetName: "Horas" }],
      ["settings.updateCalendar", { autoTrackingEnabled: true }],
      ["settings.updateDriveBackup", { enabled: true }],
      ["settings.updateClockify", { autoSyncEnabled: true }],
      ["settings.updateMonday", { autoImportEnabled: true }],
      ["settings.updateZendesk", { workspaceId: WS_ATIVO }],
    ];
    for (const [op, body] of writes) {
      const result = await call(op, { body });
      expect(result.status, op).toBe(200);
      expect(JSON.stringify(result.body), op).not.toContain("SECRET");
    }
  });

  it("sem conexão a leitura diz connected: false, e editar é 409", async () => {
    const { call } = setup({ googleRefreshToken: "", mondayApiKey: "", llmModel: "" });
    expect((await call("settings.getSheets")).body).toMatchObject({ connected: false });
    expect((await call("settings.getLlm")).body).toMatchObject({ connected: false });
    expect(await call("settings.updateDriveBackup", { body: { enabled: true } })).toEqual({
      status: 409,
      body: { error: "Google não conectado. Conecte o Google em Integrações." },
    });
    expect((await call("settings.updateMonday", { body: {} })).status).toBe(409);
  });
});

describe("Google Sheets", () => {
  it("lê com a aba padrão e grava como os campos da tela", async () => {
    const { call, values } = setup();
    expect((await call("settings.getSheets")).body).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE_ID,
      sheetName: "DeskClock",
      autoSyncEnabled: true,
      autoSyncMode: "daily",
    });
    const reversed = [...DEFAULT_COLUMN_MAPPING].reverse();
    const result = await call("settings.updateSheets", {
      body: {
        spreadsheetId: "  abc  ",
        sheetName: "   ",
        columnMapping: reversed,
        autoSyncTrigger: "fixed-time",
        autoSyncTime: "09:30",
      },
    });
    expect(result.status).toBe(200);
    expect(values.integrationGoogleSheetsSpreadsheetId).toBe("abc");
    expect(values.integrationGoogleSheetsSheetName).toBe("DeskClock");
    expect(values.integrationGoogleSheetsColumnMapping).toEqual(reversed);
    expect(values.sheetsAutoSyncTrigger).toBe("fixed-time");
    expect(values.sheetsAutoSyncTime).toBe("09:30");
  });

  it.each([
    [{ columnMapping: DEFAULT_COLUMN_MAPPING.slice(1) }],
    [{ durationFormat: "MM" }],
    [{ autoSyncTime: "25:00" }],
    [{ autoSyncMode: "hourly" }],
    [{ sheetName: null }],
    [{ lastSync: "x" }],
  ])("recusa %j com 400 sem gravar", async (body) => {
    const { call, config } = setup();
    expect((await call("settings.updateSheets", { body })).status).toBe(400);
    expect(config.set).not.toHaveBeenCalled();
  });

  it("workspace que não existe é 409", async () => {
    const { call } = setup();
    const result = await call("settings.updateSheets", { body: { workspaceId: "ws-x" } });
    expect(result).toEqual({ status: 409, body: { error: "Workspace 'ws-x' não encontrado" } });
  });
});

describe("Google Agenda e backup", () => {
  it("regra de ignorar entra uma vez; repetida não duplica", async () => {
    const { call, values } = setup();
    const add = await call("calendar.addIgnoreRule", {
      body: { operator: "contains", value: " Almoço " },
    });
    expect(add).toEqual({
      status: 201,
      body: {
        added: true,
        ignoreRules: [
          { operator: "equals", value: "Daily" },
          { operator: "contains", value: "Almoço" },
        ],
      },
    });
    const again = await call("calendar.addIgnoreRule", {
      body: { operator: "equals", value: "daily" },
    });
    expect(again.status).toBe(200);
    expect((again.body as { added: boolean }).added).toBe(false);
    expect(values.calendarIgnoreRules).toHaveLength(2);
  });

  it("remover tira a regra; a que não existe é 404", async () => {
    const { call, values } = setup();
    const removed = await call("calendar.removeIgnoreRule", {
      body: { operator: "equals", value: "Daily" },
    });
    expect(removed).toEqual({ status: 200, body: { ignoreRules: [] } });
    expect(values.calendarIgnoreRules).toEqual([]);
    const missing = await call("calendar.removeIgnoreRule", {
      body: { operator: "equals", value: "Daily" },
    });
    expect(missing.status).toBe(404);
  });

  it("regra em branco ou operador fora das opções é 400", async () => {
    const { call } = setup();
    expect(
      (await call("calendar.addIgnoreRule", { body: { operator: "equals", value: " " } })).status
    ).toBe(400);
    expect(
      (await call("calendar.addIgnoreRule", { body: { operator: "starts", value: "x" } })).status
    ).toBe(400);
  });

  it("backup: liga e troca a frequência; fora das opções é 400", async () => {
    const { call, values } = setup();
    const result = await call("settings.updateDriveBackup", {
      body: { enabled: true, frequency: "monthly" },
    });
    expect(result.body).toEqual({ connected: true, enabled: true, frequency: "monthly" });
    expect(values.driveBackupEnabled).toBe(true);
    expect(
      (await call("settings.updateDriveBackup", { body: { frequency: "hourly" } })).status
    ).toBe(400);
  });
});

describe("Clockify", () => {
  it("lê os vínculos do workspace do Clockify escolhido", async () => {
    const { call } = setup();
    expect((await call("settings.getClockify")).body).toMatchObject({
      clockifyWorkspaceId: "cw-1",
      clockifyWorkspaceName: "Aktie",
      projectMappings: [
        {
          projectId: "proj-ativo",
          clockifyProjectId: "cp-1",
          clockifyProjectName: "Acme - Portal",
        },
      ],
    });
  });

  it("troca o workspace do Clockify pelo da lista; fora dela é 409", async () => {
    const { call, values } = setup();
    const ok = await call("settings.updateClockify", { body: { clockifyWorkspaceId: "cw-2" } });
    expect(ok.status).toBe(200);
    expect(values.clockifyActiveWorkspaceName).toBe("Pessoal");
    expect((ok.body as { projectMappings: unknown[] }).projectMappings).toEqual([]);
    const bad = await call("settings.updateClockify", { body: { clockifyWorkspaceId: "cw-9" } });
    expect(bad.status).toBe(409);
  });

  it("atualizar a lista relê do Clockify e grava o cache", async () => {
    const { call, values } = setup();
    const result = await call("clockify.workspaces");
    expect(result.body).toEqual({ workspaces: [{ id: "cw-3", name: "Novo" }] });
    expect(values.clockifyWorkspaceCache).toEqual([{ id: "cw-3", name: "Novo" }]);
  });

  it("vincula projeto pelo projeto do Clockify, com o nome exibido", async () => {
    const { call, values } = setup();
    const result = await call("clockify.setProjectMapping", {
      id: "proj-ativo",
      body: { clockifyProjectId: "cp-2" },
    });
    expect(result.status).toBe(200);
    expect(values.clockifyProjectMapping).toEqual([
      {
        deskclockProjectId: "proj-ativo",
        clockifyProjectId: "cp-2",
        clockifyProjectName: "Beta - Suporte",
        workspaceId: "cw-1",
      },
    ]);
  });

  it("projeto do DeskClock ausente é 404; do Clockify ausente é 409", async () => {
    const { call } = setup();
    expect(
      (
        await call("clockify.setProjectMapping", {
          id: "nope",
          body: { clockifyProjectId: "cp-2" },
        })
      ).status
    ).toBe(404);
    expect(
      (
        await call("clockify.setProjectMapping", {
          id: "proj-ativo",
          body: { clockifyProjectId: "cp-x" },
        })
      ).status
    ).toBe(409);
  });

  it("desvincular é 204; sem vínculo é 404", async () => {
    const { call, values } = setup();
    expect((await call("clockify.removeProjectMapping", { id: "proj-ativo" })).status).toBe(204);
    expect(values.clockifyProjectMapping).toEqual([]);
    expect((await call("clockify.removeProjectMapping", { id: "proj-ativo" })).status).toBe(404);
  });

  it("tags da categoria e tags padrão conferem a lista do Clockify", async () => {
    const { call, values } = setup();
    const ok = await call("clockify.setCategoryTags", {
      id: "cat-ativo",
      body: { tagIds: ["t-1", "t-1"] },
    });
    expect(ok.status).toBe(200);
    expect(values.clockifyCategoryMapping).toEqual([
      { deskclockCategoryId: "cat-ativo", clockifyTagIds: ["t-1"], workspaceId: "cw-1" },
    ]);
    expect((await call("clockify.setDefaultTags", { body: { tagIds: ["t-9"] } })).status).toBe(409);
    expect((await call("clockify.setDefaultTags", { body: { tagIds: [] } })).status).toBe(200);
    expect((await call("clockify.setDefaultTags", { body: { tagIds: "t-1" } })).status).toBe(400);
  });

  it("importar projetos cria e vincula, e avisa as janelas", async () => {
    const { call, deps } = setup();
    const result = await call("clockify.importProjects");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ fetched: 1 });
    expect(deps.projectRepo.save).toHaveBeenCalled();
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
  });

  it("sem workspace do Clockify, vínculos e listas são 409", async () => {
    const { call } = setup({ clockifyActiveWorkspaceId: "" });
    expect((await call("clockify.catalog")).status).toBe(409);
    expect((await call("clockify.importTags")).status).toBe(409);
  });
});

describe("Monday", () => {
  it("lê os projetos do destino e o estado dos campos de catálogo", async () => {
    const { call } = setup();
    expect((await call("settings.getMonday")).body).toMatchObject({
      portfolioBoardId: "100",
      projects: [
        {
          projectId: "proj-ativo",
          projectName: "Cliente",
          portfolioItemId: "item-1",
          boardId: "",
          scope: "cliente",
        },
      ],
      catalogFields: {
        projectStage: { fieldId: "", fieldLabel: null, catalogLabels: 2, missingOptions: 0 },
        nonBillableReason: { catalogLabels: 0 },
      },
    });
  });

  it("vincula só campo de seleção não arquivado; ids de board são aparados", async () => {
    const { call, values, setFields } = setup();
    setFields([
      stageField,
      { ...stageField, id: "f-text", type: "text", label: "Texto" },
      { ...stageField, id: "f-old", archived: true, label: "Velho" },
    ]);
    expect(
      (await call("settings.updateMonday", { body: { projectStageFieldId: "f-text" } })).status
    ).toBe(409);
    expect(
      (await call("settings.updateMonday", { body: { projectStageFieldId: "f-old" } })).status
    ).toBe(409);
    const ok = await call("settings.updateMonday", {
      body: { projectStageFieldId: "f-stage", portfolioBoardId: " 101 " },
    });
    expect(ok.status).toBe(200);
    expect(values.mondayProjectStageFieldId).toBe("f-stage");
    expect(values.mondayPortfolioBoardId).toBe("101");
    expect(
      (await call("settings.updateMonday", { body: { projectStageFieldId: "" } })).status
    ).toBe(200);
  });

  it("criar do Monday cria o select com os rótulos e vincula", async () => {
    const { call, values, deps } = setup();
    const result = await call("monday.createCatalogField", { id: "project_stage" });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ label: "Project Stage", created: true, options: 2 });
    expect(values.mondayProjectStageFieldId).toBe((result.body as { fieldId: string }).fieldId);
    expect(deps.notifyCustomFieldsChanged).toHaveBeenCalled();
    // Já vinculado: o botão da tela vira "Atualizar".
    expect((await call("monday.createCatalogField", { id: "project_stage" })).status).toBe(409);
  });

  it("criar sem catálogo lido é 409; campo desconhecido é 404", async () => {
    const { call } = setup();
    expect((await call("monday.createCatalogField", { id: "non_billable_reason" })).body).toEqual({
      error: "Leia os catálogos para carregar os rótulos desta coluna.",
    });
    expect((await call("monday.createCatalogField", { id: "report_type" })).status).toBe(404);
  });

  it("atualizar acrescenta os rótulos que faltam; sem vínculo é 409", async () => {
    const { call, setFields, deps } = setup({ mondayProjectStageFieldId: "f-stage" });
    expect((await call("monday.refreshCatalogField", { id: "non_billable_reason" })).status).toBe(
      409
    );
    setFields([stageField]);
    deps.customFieldRepo.findById.mockImplementation(async () => stageField);
    const result = await call("monday.refreshCatalogField", { id: "project_stage" });
    expect(result).toEqual({ status: 200, body: { fieldId: "f-stage", added: 1 } });
    const saved = deps.customFieldRepo.update.mock.calls[0][0];
    expect(saved.options.map((o) => o.label)).toEqual(["Discovery", "Build"]);
  });

  it("quadro à mão: board que não serve é 409 sem gravar; com quadro, 409; item ausente, 404", async () => {
    const { call, config } = setup();
    const failure = await call("monday.setProjectBoard", {
      id: "item-1",
      body: { boardId: "999" },
    });
    expect(failure).toEqual({ status: 409, body: { error: "Board 999 não encontrado." } });
    expect(config.set).not.toHaveBeenCalled();
    expect(
      (await call("monday.setProjectBoard", { id: "item-9", body: { boardId: "1" } })).status
    ).toBe(404);
    expect(
      (await call("monday.setProjectBoard", { id: "item-1", body: { boardId: " " } })).status
    ).toBe(400);
    const withBoard = setup({
      mondayProjectMapping: [
        {
          deskclockProjectId: "proj-ativo",
          portfolioItemId: "item-1",
          mondayBoardId: "55",
          scope: "cliente",
        } as AppConfig["mondayProjectMapping"][number],
      ],
    });
    expect(
      (await withBoard.call("monday.setProjectBoard", { id: "item-1", body: { boardId: "1" } }))
        .status
    ).toBe(409);
  });
});

describe("Enviar agora e Zendesk", () => {
  it("envia na hora e devolve a frase do toast", async () => {
    const { call, runDailyFor } = setup();
    const result = await call("integrations.syncNow", { id: "google_sheets" });
    expect(result).toEqual({
      status: 200,
      body: { count: 3, warning: null, message: "3 tarefa(s) enviada(s) para o Sheets." },
    });
    expect(runDailyFor).toHaveBeenCalledWith("google_sheets", TODAY);
  });

  it("só no modo diário, só com planilha, e o erro do envio é 502", async () => {
    const monday = setup();
    expect((await monday.call("integrations.syncNow", { id: "monday" })).status).toBe(409);
    const noSheet = setup({ integrationGoogleSheetsSpreadsheetId: "" });
    expect((await noSheet.call("integrations.syncNow", { id: "google_sheets" })).body).toEqual({
      error: "Configure o ID da planilha antes de enviar.",
    });
    const failing = setup();
    failing.runDailyFor.mockResolvedValueOnce({
      integration: "google_sheets",
      count: 0,
      error: new Error("Planilha sem permissão."),
    });
    expect(await failing.call("integrations.syncNow", { id: "google_sheets" })).toEqual({
      status: 502,
      body: { error: "Planilha sem permissão." },
    });
    expect((await failing.call("integrations.syncNow", { id: "clockify" })).status).toBe(404);
  });

  it("Zendesk grava só o workspace", async () => {
    const { call, values } = setup();
    const result = await call("settings.updateZendesk", { body: { workspaceId: WS_OUTRO } });
    expect(result.body).toEqual({ connected: true, workspaceId: WS_OUTRO });
    expect(values.zendeskDeskclockWorkspaceId).toBe(WS_OUTRO);
    expect((await call("settings.updateZendesk", { body: { subdomain: "acme" } })).status).toBe(
      400
    );
  });
});

// ---------------- Cobertura de segredo e de estado interno: as 27 ops ----------------

const AUTO_SYNC_KEYS = ["autoSyncEnabled", "autoSyncMode", "autoSyncTrigger", "autoSyncTime"];
const SHEETS_KEYS = [
  "connected",
  "workspaceId",
  "spreadsheetId",
  "sheetName",
  "columnMapping",
  "durationFormat",
  ...AUTO_SYNC_KEYS,
];
const CALENDAR_KEYS = ["connected", "workspaceId", "autoTrackingEnabled", "ignoreRules"];
const DRIVE_KEYS = ["connected", "enabled", "frequency"];
const CLOCKIFY_KEYS = [
  "connected",
  "workspaceId",
  "clockifyWorkspaceId",
  "clockifyWorkspaceName",
  "defaultTagIds",
  "projectMappings",
  "categoryMappings",
  ...AUTO_SYNC_KEYS,
];
const MONDAY_KEYS = [
  "connected",
  "workspaceId",
  "portfolioBoardId",
  "reportBoardId",
  "autoImportEnabled",
  "projectStageFieldId",
  "nonBillableReasonFieldId",
  "catalogFields",
  "projects",
  ...AUTO_SYNC_KEYS,
];

/** As chaves de topo que cada op pode devolver no sucesso — nada além delas. */
const WHITELIST: Record<string, string[]> = {
  "settings.getSheets": SHEETS_KEYS,
  "settings.updateSheets": SHEETS_KEYS,
  "settings.getCalendar": CALENDAR_KEYS,
  "settings.updateCalendar": CALENDAR_KEYS,
  "settings.getDriveBackup": DRIVE_KEYS,
  "settings.updateDriveBackup": DRIVE_KEYS,
  "settings.getClockify": CLOCKIFY_KEYS,
  "settings.updateClockify": CLOCKIFY_KEYS,
  "settings.getMonday": MONDAY_KEYS,
  "settings.updateMonday": MONDAY_KEYS,
  "settings.getZendesk": ["connected", "workspaceId"],
  "settings.updateZendesk": ["connected", "workspaceId"],
  "settings.getLlm": ["connected", "providerId", "model"],
  "calendar.addIgnoreRule": ["added", "ignoreRules"],
  "calendar.removeIgnoreRule": ["ignoreRules"],
  "clockify.workspaces": ["workspaces"],
  "clockify.catalog": ["projects", "tags"],
  "clockify.setProjectMapping": CLOCKIFY_KEYS,
  "clockify.removeProjectMapping": [],
  "clockify.setCategoryTags": CLOCKIFY_KEYS,
  "clockify.setDefaultTags": CLOCKIFY_KEYS,
  "clockify.importProjects": ["fetched", "projectMappings"],
  "clockify.importTags": ["fetched", "categoryMappings"],
  "monday.createCatalogField": ["fieldId", "label", "created", "options"],
  "monday.refreshCatalogField": ["fieldId", "added"],
  "monday.setProjectBoard": ["projectId", "projectName", "portfolioItemId", "boardId", "scope"],
  "integrations.syncNow": ["count", "warning", "message"],
};

type Case = {
  op: string;
  params?: LocalApiParams;
  status: number;
  /** Prepara o cenário (config e mocks) antes da chamada. */
  arrange?: (ctx: ReturnType<typeof setup>) => void;
  overrides?: Partial<AppConfig>;
};

const SUCCESS_CASES: Case[] = [
  { op: "settings.getSheets", status: 200 },
  { op: "settings.updateSheets", params: { body: { sheetName: "Horas" } }, status: 200 },
  { op: "settings.getCalendar", status: 200 },
  { op: "settings.updateCalendar", params: { body: { autoTrackingEnabled: true } }, status: 200 },
  { op: "settings.getDriveBackup", status: 200 },
  { op: "settings.updateDriveBackup", params: { body: { enabled: true } }, status: 200 },
  { op: "settings.getClockify", status: 200 },
  {
    op: "settings.updateClockify",
    params: { body: { clockifyWorkspaceId: "cw-2" } },
    status: 200,
  },
  { op: "settings.getMonday", status: 200 },
  { op: "settings.updateMonday", params: { body: { autoImportEnabled: true } }, status: 200 },
  { op: "settings.getZendesk", status: 200 },
  { op: "settings.updateZendesk", params: { body: { workspaceId: WS_ATIVO } }, status: 200 },
  { op: "settings.getLlm", status: 200 },
  {
    op: "calendar.addIgnoreRule",
    params: { body: { operator: "contains", value: "Almoço" } },
    status: 201,
  },
  {
    op: "calendar.removeIgnoreRule",
    params: { body: { operator: "equals", value: "Daily" } },
    status: 200,
  },
  { op: "clockify.workspaces", status: 200 },
  { op: "clockify.catalog", status: 200 },
  {
    op: "clockify.setProjectMapping",
    params: { id: "proj-ativo", body: { clockifyProjectId: "cp-2" } },
    status: 200,
  },
  { op: "clockify.removeProjectMapping", params: { id: "proj-ativo" }, status: 204 },
  {
    op: "clockify.setCategoryTags",
    params: { id: "cat-ativo", body: { tagIds: ["t-1"] } },
    status: 200,
  },
  { op: "clockify.setDefaultTags", params: { body: { tagIds: ["t-1"] } }, status: 200 },
  { op: "clockify.importProjects", status: 200 },
  { op: "clockify.importTags", status: 200 },
  { op: "monday.createCatalogField", params: { id: "project_stage" }, status: 201 },
  {
    op: "monday.refreshCatalogField",
    params: { id: "project_stage" },
    status: 200,
    overrides: { mondayProjectStageFieldId: "f-stage" },
    arrange: ({ setFields, deps }) => {
      setFields([stageField]);
      deps.customFieldRepo.findById.mockImplementation(async () => stageField);
    },
  },
  {
    op: "monday.setProjectBoard",
    params: { id: "item-1", body: { boardId: "999" } },
    status: 200,
    // Um schema de board válido é do `mondayCatalogImports.test.ts`; aqui a
    // gravação é substituída para a resposta de sucesso passar pelo laço.
    arrange: ({ deps }) => {
      vi.spyOn(deps.integrationSettings, "setMondayProjectBoard").mockResolvedValueOnce();
    },
  },
  { op: "integrations.syncNow", params: { id: "google_sheets" }, status: 200 },
];

const ERROR_CASES: Case[] = [
  // 400: forma.
  { op: "settings.updateSheets", params: { body: { sheetName: null } }, status: 400 },
  { op: "calendar.addIgnoreRule", params: { body: { operator: "x", value: "y" } }, status: 400 },
  { op: "clockify.setDefaultTags", params: { body: { tagIds: "t" } }, status: 400 },
  { op: "monday.setProjectBoard", params: { id: "item-1", body: {} }, status: 400 },
  // 404: o que a rota aponta não existe.
  {
    op: "calendar.removeIgnoreRule",
    params: { body: { operator: "contains", value: "nada" } },
    status: 404,
  },
  { op: "clockify.removeProjectMapping", params: { id: "nope" }, status: 404 },
  { op: "monday.createCatalogField", params: { id: "report_type" }, status: 404 },
  { op: "integrations.syncNow", params: { id: "clockify" }, status: 404 },
  // 409: sem conexão, referência inválida, estado da tela.
  {
    op: "settings.updateMonday",
    params: { body: {} },
    status: 409,
    overrides: { mondayApiKey: "" },
  },
  {
    op: "settings.updateClockify",
    params: { body: { clockifyWorkspaceId: "cw-x" } },
    status: 409,
  },
  {
    op: "clockify.setProjectMapping",
    params: { id: "proj-ativo", body: { clockifyProjectId: "cp-x" } },
    status: 409,
  },
  { op: "monday.refreshCatalogField", params: { id: "project_stage" }, status: 409 },
  {
    op: "monday.setProjectBoard",
    params: { id: "item-1", body: { boardId: "999" } },
    status: 409,
  },
  {
    op: "integrations.syncNow",
    params: { id: "google_sheets" },
    status: 409,
    overrides: { integrationGoogleSheetsSpreadsheetId: "" },
  },
  // 500: o serviço rejeita, e a mensagem dele volta como "Erro interno".
  {
    op: "clockify.catalog",
    status: 500,
    arrange: ({ clockifyApi }) => {
      clockifyApi.listProjects.mockRejectedValueOnce(new Error("rede caiu"));
    },
  },
  {
    op: "clockify.workspaces",
    status: 500,
    arrange: ({ clockifyApi }) => {
      clockifyApi.listWorkspaces.mockRejectedValueOnce(new Error("401 do Clockify"));
    },
  },
  {
    op: "clockify.importTags",
    status: 500,
    arrange: ({ clockifyApi }) => {
      clockifyApi.listTags.mockRejectedValueOnce(new Error("timeout"));
    },
  },
  // 502: o envio falhou.
  {
    op: "integrations.syncNow",
    params: { id: "google_sheets" },
    status: 502,
    arrange: ({ runDailyFor }) => {
      runDailyFor.mockResolvedValueOnce({
        integration: "google_sheets",
        count: 0,
        error: new Error("Planilha sem permissão."),
      });
    },
  },
];

function assertClean(op: string, result: unknown) {
  const text = JSON.stringify(result);
  expect(text, op).not.toContain("SECRET");
  expect(text, op).not.toContain("INTERNAL");
}

describe("nenhum segredo nem estado interno sai, em nenhuma das 27 ops", () => {
  it("toda op da D3b está no laço", () => {
    const covered = new Set(SUCCESS_CASES.map((c) => c.op));
    expect([...covered].sort()).toEqual(Object.keys(WHITELIST).sort());
    expect(covered.size).toBe(27);
  });

  it.each(SUCCESS_CASES)(
    "sucesso de $op: só as chaves da whitelist",
    async ({ op, params, status, arrange, overrides }) => {
      const ctx = setup(overrides);
      arrange?.(ctx);
      const result = await ctx.call(op, params);
      expect(result.status, JSON.stringify(result)).toBe(status);
      assertClean(op, result);
      if (result.body !== null) {
        const keys = Object.keys(result.body as object);
        expect(
          keys.filter((k) => !WHITELIST[op].includes(k)),
          op
        ).toEqual([]);
      }
    }
  );

  it.each(ERROR_CASES)(
    "erro $status de $op: só { error }, sem segredo",
    async ({ op, params, status, arrange, overrides }) => {
      const ctx = setup(overrides);
      arrange?.(ctx);
      const result = await ctx.call(op, params);
      expect(result.status, JSON.stringify(result)).toBe(status);
      expect(Object.keys(result.body as object)).toEqual(["error"]);
      assertClean(op, result);
    }
  );
});

describe("PATCH com chave proibida", () => {
  const FORBIDDEN: [string, unknown][] = [
    ["clockifyApiKey", "x"],
    ["mondayApiKey", "x"],
    ["googleRefreshToken", "x"],
    ["zendeskClientSecret", "x"],
    ["llmApiKey", "x"],
    ["llmBaseUrl", "https://x"],
    ["driveBackupFolderId", "x"],
    ["sheetsDailySyncLastTimestamp", "x"],
    ["clockifyWorkspaceCache", [{ id: "a", name: "b" }]],
  ];
  const GROUPS = [
    "settings.updateSheets",
    "settings.updateCalendar",
    "settings.updateDriveBackup",
    "settings.updateClockify",
    "settings.updateMonday",
    "settings.updateZendesk",
  ];
  const cases = GROUPS.flatMap((op) => FORBIDDEN.map(([key, value]) => ({ op, key, value })));

  it.each(cases)("$op com $key é 400 e não grava", async ({ op, key, value }) => {
    const { call, config } = setup();
    const result = await call(op, { body: { [key]: value } });
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toContain("Configuração desconhecida");
    expect(config.set).not.toHaveBeenCalled();
    assertClean(op, result);
  });
});

describe("colunas da planilha", () => {
  it("chave a mais no item não chega à config nem à resposta", async () => {
    const { call, values } = setup();
    const withExtra = DEFAULT_COLUMN_MAPPING.map((c) => ({ ...c, secret: "SECRET-extra" }));
    const result = await call("settings.updateSheets", { body: { columnMapping: withExtra } });
    expect(result.status).toBe(200);
    expect(values.integrationGoogleSheetsColumnMapping).toEqual(DEFAULT_COLUMN_MAPPING);
    assertClean("settings.updateSheets", result);
  });
});

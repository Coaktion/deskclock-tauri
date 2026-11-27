import { describe, it, expect, vi } from "vitest";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import {
  buildCalendarImportSource,
  buildMondayImportSource,
  buildZendeskImportSource,
  GOOGLE_CALENDAR_NOT_CONNECTED,
  MONDAY_NOT_CONFIGURED,
  ZENDESK_NOT_CONNECTED,
} from "@presentation/integrations/importSources";
import type { ConfigContextValue } from "@shared/types/appConfig";

function makeConfig(values: Record<string, unknown>) {
  return {
    isLoaded: true,
    loadError: null,
    get: vi.fn((key: string) => {
      if (key in values) return values[key];
      if (key === "mondayFieldCatalogs") return undefined;
      return key === "mondayProjectMapping" || key === "calendarIgnoreRules" ? [] : "";
    }),
    set: vi.fn(async () => {}),
  } as unknown as ConfigContextValue;
}

const factories = {
  createCalendarImporter: vi.fn(() => ({ getEvents: vi.fn() })),
  createTicketImporter: vi.fn(() => ({ getTickets: vi.fn() })),
  createMondayApi: vi.fn(() => ({})),
} as unknown as IntegrationFactories;

const repos = {} as never;

describe("fontes dos imports", () => {
  it("sem conexão, cada uma diz por quê", () => {
    const config = makeConfig({});
    expect(buildCalendarImportSource(config, factories).notConfiguredMessage).toBe(
      GOOGLE_CALENDAR_NOT_CONNECTED
    );
    expect(buildZendeskImportSource(config, factories).notConfiguredMessage).toBe(
      ZENDESK_NOT_CONNECTED
    );
    expect(buildMondayImportSource(config, factories, repos).notConfiguredMessage).toBe(
      MONDAY_NOT_CONFIGURED
    );
  });

  it("conectadas, usam o workspace de cada integração e vazio cai no Padrão", () => {
    const config = makeConfig({
      googleRefreshToken: "r",
      calendarDeskclockWorkspaceId: "ws-cal",
      calendarIgnoreRules: [{ operator: "equals", value: "x" }],
      showWeekend: true,
      zendeskAccessToken: "z",
      mondayApiKey: "m",
      mondayDeskclockWorkspaceId: "ws-m",
      mondayUserId: "u1",
    });
    const calendar = buildCalendarImportSource(config, factories);
    expect(calendar).toMatchObject({
      notConfiguredMessage: null,
      workspaceId: "ws-cal",
      showWeekend: true,
      ignoreRules: [{ operator: "equals", value: "x" }],
    });
    expect(buildZendeskImportSource(config, factories)).toMatchObject({
      notConfiguredMessage: null,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
    expect(buildMondayImportSource(config, factories, repos)).toMatchObject({
      notConfiguredMessage: null,
      workspaceId: "ws-m",
      personId: "u1",
    });
  });
});

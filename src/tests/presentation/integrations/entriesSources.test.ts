import { describe, it, expect, vi } from "vitest";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import {
  buildClockifyEntriesSource,
  buildMondayEntriesSource,
  CLOCKIFY_ENTRIES_NOT_CONFIGURED,
  MONDAY_ENTRIES_NOT_CONFIGURED,
} from "@presentation/integrations/entriesSources";
import type { ConfigContextValue } from "@shared/types/appConfig";

function makeConfig(values: Record<string, unknown>) {
  return {
    isLoaded: true,
    loadError: null,
    get: vi.fn((key: string) =>
      key in values
        ? values[key]
        : key === "mondayProjectMapping" || key === "clockifyDefaultTagIds"
          ? []
          : ""
    ),
    set: vi.fn(async () => {}),
  } as unknown as ConfigContextValue;
}

const factories = {
  createClockifyApi: vi.fn(() => ({})),
  createMondayApi: vi.fn(() => ({})),
} as unknown as IntegrationFactories;

describe("fontes dos lançamentos", () => {
  it("Clockify exige chave, workspace e usuário, como o modal", () => {
    const partial = makeConfig({ clockifyApiKey: "k", clockifyActiveWorkspaceId: "w" });
    expect(buildClockifyEntriesSource(partial, factories).notConfiguredMessage).toBe(
      CLOCKIFY_ENTRIES_NOT_CONFIGURED
    );
    const full = makeConfig({
      clockifyApiKey: "k",
      clockifyActiveWorkspaceId: "w",
      clockifyUserId: "u",
      clockifyDefaultTagIds: ["t1"],
    });
    const source = buildClockifyEntriesSource(full, factories);
    expect(source.notConfiguredMessage).toBeNull();
    expect(source.defaultTagIds).toEqual(["t1"]);
  });

  it("Monday exige chave, usuário e um projeto com board", () => {
    const noBoard = makeConfig({
      mondayApiKey: "k",
      mondayUserId: "u",
      mondayProjectMapping: [{ deskclockProjectId: "p", mondayBoardId: "" }],
    });
    expect(buildMondayEntriesSource(noBoard, factories).notConfiguredMessage).toBe(
      MONDAY_ENTRIES_NOT_CONFIGURED
    );
  });
});

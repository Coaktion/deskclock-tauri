import { describe, it, expect, vi } from "vitest";

vi.mock("@infra/database/db", () => ({ isDevDatabase: vi.fn(async () => true) }));

const { buildDriveBackupSource, driveBackupNeedsReconnect, GOOGLE_DRIVE_NOT_CONNECTED } =
  await import("@presentation/integrations/driveBackup");
const { DRIVE_RECONNECT_MESSAGE } =
  await import("@infra/integrations/googledrive/GoogleDriveClient");
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { ConfigContextValue } from "@shared/types/appConfig";

function makeConfig(values: Record<string, unknown>) {
  return {
    isLoaded: true,
    loadError: null,
    get: vi.fn((key: string) => values[key]),
    set: vi.fn(async () => {}),
  } as unknown as ConfigContextValue;
}

const run = vi.fn(async () => "file-1");
const factories = {
  createDriveBackupRunner: vi.fn(() => ({ run })),
} as unknown as IntegrationFactories;

const BASE = {
  googleRefreshToken: "segredo",
  driveBackupEnabled: true,
  driveBackupFrequency: "weekly",
  driveBackupLastRunAt: 0,
  driveBackupLastError: "",
};

describe("buildDriveBackupSource", () => {
  it("sem o Google conectado, não configurado", () => {
    const source = buildDriveBackupSource(
      makeConfig({ ...BASE, googleRefreshToken: "" }),
      factories
    );
    expect(source.notConfiguredMessage).toBe(GOOGLE_DRIVE_NOT_CONNECTED);
  });

  it("o estado é o da subseção, sem token nenhum", async () => {
    const lastRunAt = Date.UTC(2026, 8, 15, 12);
    const source = buildDriveBackupSource(
      makeConfig({ ...BASE, driveBackupLastRunAt: lastRunAt }),
      factories
    );
    const status = await source.status();
    expect(status).toEqual({
      connected: true,
      enabled: true,
      frequency: "weekly",
      lastRunAt: "2026-09-15T12:00:00.000Z",
      lastError: null,
      needsReconnect: false,
      folderName: "DeskClock Backups (dev)",
    });
    expect(JSON.stringify(status)).not.toContain("segredo");
  });

  it("nunca rodou é null; o 403 do escopo pede reconectar", async () => {
    const source = buildDriveBackupSource(
      makeConfig({ ...BASE, driveBackupLastError: DRIVE_RECONNECT_MESSAGE }),
      factories
    );
    const status = await source.status();
    expect(status.lastRunAt).toBeNull();
    expect(status.needsReconnect).toBe(true);
    expect(driveBackupNeedsReconnect("outra falha")).toBe(false);
  });

  it("run é o runner do botão", async () => {
    const source = buildDriveBackupSource(makeConfig(BASE), factories);
    expect(await source.run()).toBe("file-1");
  });
});

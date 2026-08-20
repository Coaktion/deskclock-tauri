import type { AutoSyncApi } from "@presentation/contexts/AutoSyncContext";
import { useDailySyncScheduler } from "@presentation/hooks/useDailySyncScheduler";
import type { AppConfig, ConfigContextValue } from "@shared/types/appConfig";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/utils/toast", () => ({ showToast: vi.fn(async () => {}) }));

const POLL_MS = 30_000;

/** Um dia útil qualquer, às 18:00 em ponto no fuso local. */
function atLocalTime(hh: number, mm: number): Date {
  return new Date(2026, 7, 19, hh, mm, 0);
}

function makeConfig(values: Partial<AppConfig> = {}): ConfigContextValue & {
  store: Record<string, unknown>;
} {
  const store: Record<string, unknown> = {
    integrationGoogleSheetsAutoSync: false,
    sheetsAutoSyncMode: "daily",
    sheetsAutoSyncTrigger: "fixed-time",
    sheetsAutoSyncTime: "18:00",
    sheetsAutoSyncLastFiredDate: "",
    clockifyAutoSync: false,
    clockifyAutoSyncMode: "daily",
    clockifyAutoSyncTrigger: "fixed-time",
    clockifyAutoSyncTime: "18:00",
    clockifyAutoSyncLastFiredDate: "",
    mondayAutoSync: false,
    mondayAutoSyncMode: "daily",
    mondayAutoSyncTrigger: "fixed-time",
    mondayAutoSyncTime: "18:00",
    mondayAutoSyncLastFiredDate: "",
    ...values,
  };
  return {
    isLoaded: true,
    loadError: null,
    store,
    get: ((key: string) => store[key]) as ConfigContextValue["get"],
    set: (async (key: string, value: unknown) => {
      store[key] = value;
    }) as ConfigContextValue["set"],
  };
}

/** `isDailyEnabled` responde pelos nomes passados; os demais ficam desligados. */
function makeAutoSync(enabled: string[]): AutoSyncApi & { runDailyFor: ReturnType<typeof vi.fn> } {
  const runDailyFor = vi.fn(async (integration: string) => ({ integration, count: 1 }));
  return {
    runPerTask: vi.fn(async () => []),
    runDaily: vi.fn(async () => []),
    runDailyFor,
    isDailyEnabled: (name: string) => enabled.includes(name),
    isSyncing: () => false,
  } as unknown as AutoSyncApi & { runDailyFor: ReturnType<typeof vi.fn> };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Monta o hook e deixa o disparo inicial (síncrono no mount) concluir. */
async function mount(config: ConfigContextValue, autoSync: AutoSyncApi) {
  const rendered = renderHook(() => useDailySyncScheduler(config, autoSync));
  await act(async () => {});
  return rendered;
}

describe("useDailySyncScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("dispara o Monday no horário fixo configurado", async () => {
    vi.setSystemTime(atLocalTime(18, 0));
    const config = makeConfig({ mondayAutoSync: true });
    const autoSync = makeAutoSync(["Monday"]);

    await mount(config, autoSync);

    expect(autoSync.runDailyFor).toHaveBeenCalledWith("Monday", expect.any(String));
  });

  it("não dispara o Monday fora do horário configurado", async () => {
    vi.setSystemTime(atLocalTime(9, 0));
    const config = makeConfig({ mondayAutoSync: true });
    const autoSync = makeAutoSync(["Monday"]);

    await mount(config, autoSync);
    await advance(POLL_MS * 4);

    expect(autoSync.runDailyFor).not.toHaveBeenCalled();
  });

  it("não dispara integração desabilitada mesmo com o horário batendo", async () => {
    vi.setSystemTime(atLocalTime(18, 0));
    const config = makeConfig({ mondayAutoSync: true });
    const autoSync = makeAutoSync([]);

    await mount(config, autoSync);

    expect(autoSync.runDailyFor).not.toHaveBeenCalled();
  });

  it("o gatilho de uma integração não arrasta as outras", async () => {
    vi.setSystemTime(atLocalTime(18, 0));
    const config = makeConfig({
      integrationGoogleSheetsAutoSync: true,
      sheetsAutoSyncTrigger: "on-open",
      mondayAutoSync: true,
      mondayAutoSyncTime: "22:00",
    });
    const autoSync = makeAutoSync(["Google Sheets", "Monday"]);

    await mount(config, autoSync);

    expect(autoSync.runDailyFor).toHaveBeenCalledTimes(1);
    expect(autoSync.runDailyFor).toHaveBeenCalledWith("Google Sheets", expect.any(String));
  });

  it("on-open dispara uma vez por sessão, por integração", async () => {
    vi.setSystemTime(atLocalTime(9, 0));
    const config = makeConfig({
      mondayAutoSync: true,
      mondayAutoSyncTrigger: "on-open",
      clockifyAutoSync: true,
      clockifyAutoSyncTrigger: "on-open",
    });
    const autoSync = makeAutoSync(["Monday", "Clockify"]);

    await mount(config, autoSync);
    await advance(POLL_MS * 5);

    expect(autoSync.runDailyFor).toHaveBeenCalledTimes(2);
    expect(autoSync.runDailyFor.mock.calls.map((c) => c[0]).sort()).toEqual(["Clockify", "Monday"]);
  });

  it("não redispara no mesmo dia e horário", async () => {
    vi.setSystemTime(atLocalTime(18, 0));
    const config = makeConfig({ mondayAutoSync: true });
    const autoSync = makeAutoSync(["Monday"]);

    await mount(config, autoSync);
    await advance(POLL_MS);

    expect(autoSync.runDailyFor).toHaveBeenCalledTimes(1);
    expect(config.store.mondayAutoSyncLastFiredDate).toContain("@18:00");
  });

  it("redispara quando o usuário muda o horário no mesmo dia", async () => {
    vi.setSystemTime(atLocalTime(18, 0));
    const config = makeConfig({ mondayAutoSync: true });
    const autoSync = makeAutoSync(["Monday"]);

    await mount(config, autoSync);
    expect(autoSync.runDailyFor).toHaveBeenCalledTimes(1);

    config.store.mondayAutoSyncTime = "18:30";
    vi.setSystemTime(atLocalTime(18, 30));
    await advance(POLL_MS);

    expect(autoSync.runDailyFor).toHaveBeenCalledTimes(2);
  });

  it("não dispara enquanto a config não carregou", async () => {
    vi.setSystemTime(atLocalTime(18, 0));
    const config = { ...makeConfig({ mondayAutoSync: true }), isLoaded: false };
    const autoSync = makeAutoSync(["Monday"]);

    await mount(config, autoSync);
    await advance(POLL_MS * 3);

    expect(autoSync.runDailyFor).not.toHaveBeenCalled();
  });
});

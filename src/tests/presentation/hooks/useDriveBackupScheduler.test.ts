import type { IDriveBackupRunner } from "@domain/integrations/IDriveBackupRunner";
import { useDriveBackupScheduler } from "@presentation/hooks/useDriveBackupScheduler";
import type { AppConfig, ConfigContextValue } from "@shared/types/appConfig";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const POLL_MS = 5 * 60_000;
const COOLDOWN_MS = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function makeConfig(values: Partial<AppConfig> = {}, isLoaded = true): ConfigContextValue {
  const store: Record<string, unknown> = {
    driveBackupEnabled: true,
    driveBackupFrequency: "daily",
    driveBackupLastRunAt: 0,
    ...values,
  };
  return {
    isLoaded,
    loadError: null,
    get: ((key: string) => store[key]) as ConfigContextValue["get"],
    set: (async (key: string, value: unknown) => {
      store[key] = value;
    }) as ConfigContextValue["set"],
  };
}

function makeRunner(run: IDriveBackupRunner["run"]): () => IDriveBackupRunner {
  return () => ({ run });
}

/** Avança o relógio falso deixando as promises pendentes resolverem. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useDriveBackupScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("não roda com o backup desligado", async () => {
    const run = vi.fn(() => Promise.resolve("id"));
    renderHook(() =>
      useDriveBackupScheduler(makeConfig({ driveBackupEnabled: false }), makeRunner(run))
    );

    await advance(POLL_MS * 3);
    expect(run).not.toHaveBeenCalled();
  });

  it("não roda enquanto a config não carregou, e roda quando carrega", async () => {
    const run = vi.fn(() => Promise.resolve("id"));
    const { rerender } = renderHook(
      ({ loaded }: { loaded: boolean }) =>
        useDriveBackupScheduler(makeConfig({}, loaded), makeRunner(run)),
      { initialProps: { loaded: false } }
    );

    await advance(POLL_MS);
    expect(run).not.toHaveBeenCalled();

    rerender({ loaded: true });
    await advance(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("roda no boot quando o backup está vencido", async () => {
    const run = vi.fn(() => Promise.resolve("id"));
    renderHook(() => useDriveBackupScheduler(makeConfig(), makeRunner(run)));

    await advance(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("não roda enquanto o intervalo não venceu", async () => {
    const run = vi.fn(() => Promise.resolve("id"));
    renderHook(() =>
      useDriveBackupScheduler(makeConfig({ driveBackupLastRunAt: Date.now() }), makeRunner(run))
    );

    await advance(POLL_MS * 3);
    expect(run).not.toHaveBeenCalled();
  });

  it("vence entre um poll e outro sem precisar de remontagem", async () => {
    const run = vi.fn(() => Promise.resolve("id"));
    renderHook(() =>
      useDriveBackupScheduler(
        makeConfig({ driveBackupLastRunAt: Date.now() - DAY_MS + POLL_MS }),
        makeRunner(run)
      )
    );

    await advance(0);
    expect(run).not.toHaveBeenCalled();

    await advance(POLL_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("o poll não dispara um segundo backup por cima do que está em voo", async () => {
    let settle: (id: string) => void = () => {};
    const run = vi.fn(() => new Promise<string>((resolve) => (settle = resolve)));
    renderHook(() => useDriveBackupScheduler(makeConfig(), makeRunner(run)));

    await advance(0);
    expect(run).toHaveBeenCalledTimes(1);

    await advance(POLL_MS * 4);
    expect(run).toHaveBeenCalledTimes(1);

    await act(async () => settle("id"));
  });

  it("a falha impõe uma espera antes da próxima tentativa", async () => {
    const run = vi.fn(() => Promise.reject(new Error("403")));
    renderHook(() => useDriveBackupScheduler(makeConfig(), makeRunner(run)));

    await advance(0);
    expect(run).toHaveBeenCalledTimes(1);

    // Vencido continua vencido — o carimbo só avança no sucesso —, mas a espera
    // segura a retentativa, senão seriam 288 tentativas por dia.
    await advance(POLL_MS * 2);
    expect(run).toHaveBeenCalledTimes(1);

    await advance(COOLDOWN_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("para de pollar ao desmontar", async () => {
    const run = vi.fn(() => Promise.resolve("id"));
    const { unmount } = renderHook(() =>
      useDriveBackupScheduler(makeConfig({ driveBackupEnabled: false }), makeRunner(run))
    );

    unmount();
    await advance(POLL_MS * 3);
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  claimRequestId,
  createSerialQueue,
  MAX_SEEN_IDS,
  waitForSignal,
} from "@presentation/localApi/queue";

describe("createSerialQueue", () => {
  it("executa um trabalho por vez, na ordem de chegada", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    let liberarPrimeiro!: () => void;

    const primeiro = enqueue(async () => {
      log.push("inicio-1");
      await new Promise<void>((r) => (liberarPrimeiro = r));
      log.push("fim-1");
    });
    const segundo = enqueue(async () => {
      log.push("inicio-2");
    });

    await Promise.resolve();
    expect(log).toEqual(["inicio-1"]);
    liberarPrimeiro();
    await Promise.all([primeiro, segundo]);
    expect(log).toEqual(["inicio-1", "fim-1", "inicio-2"]);
  });

  it("segue a fila depois de um trabalho que falhou", async () => {
    const enqueue = createSerialQueue();
    const falho = enqueue(async () => {
      throw new Error("x");
    });
    await expect(falho).rejects.toThrow("x");
    await expect(enqueue(async () => "ok")).resolves.toBe("ok");
  });
});

describe("waitForSignal", () => {
  it("resolve no sinal e se remove dos ouvintes", async () => {
    const listeners = new Set<() => void>();
    const espera = waitForSignal(listeners, 10_000);
    listeners.forEach((notify) => notify());
    await espera;
    expect(listeners.size).toBe(0);
  });

  it("resolve no prazo quando nenhum sinal chega", async () => {
    vi.useFakeTimers();
    const listeners = new Set<() => void>();
    const espera = waitForSignal(listeners, 300);
    vi.advanceTimersByTime(300);
    await espera;
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });
});

describe("claimRequestId", () => {
  afterEach(() => {
    globalThis.__deskclockLocalApiSeenIds = undefined;
  });

  it("aceita o id uma vez por página", () => {
    expect(claimRequestId("a")).toBe(true);
    expect(claimRequestId("a")).toBe(false);
  });

  it("passado o limite, esquece o mais antigo", () => {
    claimRequestId("a");
    for (let i = 0; i < MAX_SEEN_IDS; i++) claimRequestId(`id-${i}`);
    const seen = globalThis.__deskclockLocalApiSeenIds as Set<string> | undefined;
    expect(seen?.size).toBe(MAX_SEEN_IDS);
    expect(claimRequestId("a")).toBe(true);
  });
});

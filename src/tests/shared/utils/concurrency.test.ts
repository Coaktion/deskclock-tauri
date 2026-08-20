import { describe, it, expect, vi } from "vitest";
import { mapWithConcurrency } from "@shared/utils/concurrency";

/** Promise que só resolve quando o teste mandar. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("preserva a ordem da entrada, não a de chegada", async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });

    expect(result).toEqual([30, 10, 20]);
  });

  it("nunca passa do teto de tarefas em voo", async () => {
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    let inFlight = 0;
    let peak = 0;

    const all = mapWithConcurrency(gates, 2, async (gate) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await gate.promise;
      inFlight--;
      return null;
    });

    await Promise.resolve();
    expect(peak).toBe(2);

    gates.forEach((g) => g.resolve());
    await all;
    expect(peak).toBe(2);
  });

  it("roda tudo em paralelo quando o teto passa da quantidade", async () => {
    const run = vi.fn(async (n: number) => n * 2);

    const result = await mapWithConcurrency([1, 2], 10, run);

    expect(result).toEqual([2, 4]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("propaga o primeiro erro e não inicia o que faltava", async () => {
    const started: number[] = [];

    const promise = mapWithConcurrency([1, 2, 3, 4], 1, async (n) => {
      started.push(n);
      if (n === 2) throw new Error("falhou");
      return n;
    });

    await expect(promise).rejects.toThrow("falhou");
    expect(started).toEqual([1, 2]);
  });

  it("aceita lista vazia sem chamar nada", async () => {
    const run = vi.fn();

    await expect(mapWithConcurrency([], 4, run)).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

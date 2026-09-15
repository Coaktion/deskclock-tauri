/**
 * Executa um trabalho por vez, na ordem de chegada. A falha de um não
 * interrompe a fila.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Resolve no próximo `notify` dos ouvintes ou ao fim do prazo, o que vier antes. */
export function waitForSignal(listeners: Set<() => void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      listeners.delete(done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    listeners.add(done);
  });
}

declare global {
  var __deskclockLocalApiSeenIds: Set<string> | undefined;
}

// Folga para entregas repetidas quase simultâneas, sem crescer sem limite.
export const MAX_SEEN_IDS = 500;

/**
 * `true` só na primeira vez que o id de requisição aparece **nesta página**. O
 * registro mora no `globalThis`, e não no módulo: o HMR recria o módulo, e um
 * ouvinte antigo que sobrevivesse guardaria um conjunto antigo.
 */
export function claimRequestId(id: string): boolean {
  const seen = (globalThis.__deskclockLocalApiSeenIds ??= new Set());
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > MAX_SEEN_IDS) seen.delete(seen.values().next().value as string);
  return true;
}

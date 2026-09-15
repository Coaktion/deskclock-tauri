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

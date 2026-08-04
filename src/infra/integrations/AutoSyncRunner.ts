import type { Task } from "@domain/entities/Task";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";

export type { AutoSyncResult };

type Listener = () => void;

export class AutoSyncRunner {
  private inFlight = new Map<string, number>();
  private listeners = new Set<Listener>();
  private version = 0;

  constructor(private strategies: ISyncStrategy[]) {}

  getVersion(): number {
    return this.version;
  }

  async runPerTask(task: Task): Promise<AutoSyncResult[]> {
    const active = this.strategies.filter((s) => s.isPerTaskEnabled());
    return this.withTracking(active, (s) => s.runPerTask(task));
  }

  async runDaily(endDateISO: string): Promise<AutoSyncResult[]> {
    const active = this.strategies.filter((s) => s.isDailyEnabled());
    return this.withTracking(active, (s) => s.runDaily(endDateISO));
  }

  /**
   * Envio diário de **uma** integração, para o botão "Sincronizar agora".
   *
   * `runDaily` dispararia todas as habilitadas — o clique num card mandaria
   * tarefas para as outras integrações sem o usuário ter pedido. O gatilho aqui
   * é o clique, então `isDailyEnabled` não é consultado; devolve `null` quando o
   * nome não corresponde a nenhuma estratégia registrada.
   */
  async runDailyFor(integrationName: string, endDateISO: string): Promise<AutoSyncResult | null> {
    const strategy = this.strategies.find((s) => s.integrationName === integrationName);
    if (!strategy) return null;
    const [result] = await this.withTracking([strategy], (s) => s.runDaily(endDateISO));
    return result;
  }

  isSyncing(integrationName?: string): boolean {
    if (integrationName) return (this.inFlight.get(integrationName) ?? 0) > 0;
    return this.inFlight.size > 0;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async withTracking(
    active: ISyncStrategy[],
    run: (s: ISyncStrategy) => Promise<AutoSyncResult>
  ): Promise<AutoSyncResult[]> {
    const names = active.map((s) => s.integrationName);
    this.adjust(names, 1);
    try {
      return await Promise.all(active.map(run));
    } finally {
      this.adjust(names, -1);
    }
  }

  private adjust(names: string[], delta: 1 | -1): void {
    if (names.length === 0) return;
    for (const n of names) {
      const v = (this.inFlight.get(n) ?? 0) + delta;
      if (v <= 0) this.inFlight.delete(n);
      else this.inFlight.set(n, v);
    }
    this.version++;
    for (const l of this.listeners) l();
  }
}

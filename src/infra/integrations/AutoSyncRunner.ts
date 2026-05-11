import type { Task } from "@domain/entities/Task";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";

export type { AutoSyncResult };

export class AutoSyncRunner {
  constructor(private strategies: ISyncStrategy[]) {}

  async runPerTask(task: Task): Promise<AutoSyncResult[]> {
    return Promise.all(
      this.strategies
        .filter((s) => s.isPerTaskEnabled())
        .map((s) => s.runPerTask(task))
    );
  }

  async runDaily(endDateISO: string): Promise<AutoSyncResult[]> {
    return Promise.all(
      this.strategies
        .filter((s) => s.isDailyEnabled())
        .map((s) => s.runDaily(endDateISO))
    );
  }
}

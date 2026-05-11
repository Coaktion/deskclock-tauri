import type { Task } from "@domain/entities/Task";

export interface AutoSyncResult {
  integration: string;
  count: number;
  warning?: string;
  error?: Error;
}

export interface ISyncStrategy {
  readonly integrationName: string;
  isPerTaskEnabled(): boolean;
  isDailyEnabled(): boolean;
  runPerTask(task: Task): Promise<AutoSyncResult>;
  runDaily(endDateISO: string): Promise<AutoSyncResult>;
}

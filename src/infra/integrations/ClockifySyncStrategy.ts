import type { Task } from "@domain/entities/Task";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { IClockifyConfigPort } from "@domain/integrations/IClockifyConfigPort";
import { validateTaskForClockify, formatMissingFields } from "@domain/integrations/taskValidation";
import { runDailyTemplate } from "./runDailyTemplate";
import { ClockifyTaskSender } from "./ClockifyTaskSender";

export class ClockifySyncStrategy implements ISyncStrategy {
  readonly integrationName = "Clockify";

  constructor(
    private config: IClockifyConfigPort,
    private taskRepo: ITaskRepository,
    private logRepo: ITaskIntegrationLogRepository
  ) {}

  isPerTaskEnabled(): boolean {
    return (
      this.config.get("clockifyAutoSync") &&
      this.config.get("clockifyAutoSyncMode") === "per-task" &&
      !!this.config.get("clockifyApiKey") &&
      !!this.config.get("clockifyActiveWorkspaceId")
    );
  }

  isDailyEnabled(): boolean {
    return (
      this.config.get("clockifyAutoSync") &&
      this.config.get("clockifyAutoSyncMode") === "daily" &&
      !!this.config.get("clockifyApiKey") &&
      !!this.config.get("clockifyActiveWorkspaceId")
    );
  }

  async runPerTask(task: Task): Promise<AutoSyncResult> {
    const validation = validateTaskForClockify(task);
    if (!validation.ok) {
      return {
        integration: this.integrationName,
        count: 0,
        warning: `Tarefa não enviada ao Clockify: faltam ${formatMissingFields(validation.missing)}.`,
      };
    }
    try {
      const sender = new ClockifyTaskSender(this.config);
      await sender.send([task]);
      await this.logRepo.markSent([task.id], "clockify");
      await this.config.set("clockifyDailySyncLastTimestamp", new Date().toISOString());
      return { integration: this.integrationName, count: 1 };
    } catch (err) {
      return {
        integration: this.integrationName,
        count: 0,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  async runDaily(endDateISO: string): Promise<AutoSyncResult> {
    return runDailyTemplate(
      {
        integrationName: this.integrationName,
        integrationLabel: "Clockify",
        logKey: "clockify",
        taskRepo: this.taskRepo,
        logRepo: this.logRepo,
        timestampPort: {
          get: () => this.config.get("clockifyDailySyncLastTimestamp"),
          set: (iso) => this.config.set("clockifyDailySyncLastTimestamp", iso),
        },
        validate: (t: Task) => validateTaskForClockify(t).ok,
        createSender: () => new ClockifyTaskSender(this.config),
      },
      endDateISO
    );
  }
}

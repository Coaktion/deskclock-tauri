import type { Task } from "@domain/entities/Task";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { IClockifyConfigPort } from "@domain/integrations/IClockifyConfigPort";
import { validateTaskForClockify, formatMissingFields } from "@domain/integrations/taskValidation";
import { groupTasks } from "@domain/utils/groupTasks";
import { startOfDayISO, endOfDayISO, addDaysISO, todayISO } from "@shared/utils/time";
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
    const range = this.calcRange(endDateISO);
    if (!range) return { integration: this.integrationName, count: 0 };
    try {
      const tasks = await this.taskRepo.findByDateRange(range.start, range.end);
      const allCompleted = tasks.filter((t) => t.status === "completed");
      const completed = allCompleted.filter((t) => validateTaskForClockify(t).ok);
      const invalidCount = allCompleted.length - completed.length;
      const invalidWarning =
        invalidCount > 0
          ? `${invalidCount} tarefa(s) ignorada(s) no envio diário ao Clockify: dados incompletos.`
          : undefined;

      if (completed.length === 0)
        return { integration: this.integrationName, count: 0, warning: invalidWarning };

      const sentIds = new Set(
        await this.logRepo.findSentIds("clockify", range.start, range.end)
      );
      const groups = groupTasks(completed).filter(
        (g) => !g.tasks.every((t) => sentIds.has(t.id))
      );
      if (groups.length === 0)
        return { integration: this.integrationName, count: 0, warning: invalidWarning };

      const tasksToSend = groups.map((g) => ({ ...g.tasks[0], durationSeconds: g.totalSeconds }));
      const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id));
      const sender = new ClockifyTaskSender(this.config);
      await sender.send(tasksToSend);
      await this.logRepo.markSent(allIds, "clockify");
      await this.config.set("clockifyDailySyncLastTimestamp", new Date().toISOString());
      return { integration: this.integrationName, count: groups.length, warning: invalidWarning };
    } catch (err) {
      return {
        integration: this.integrationName,
        count: 0,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  private calcRange(endDateISO: string): { start: string; end: string } | null {
    const lastTimestamp = this.config.get("clockifyDailySyncLastTimestamp");
    const lastDateISO = lastTimestamp
      ? new Date(lastTimestamp).toLocaleDateString("sv-SE")
      : addDaysISO(todayISO(), -7);
    const startDateISO = addDaysISO(lastDateISO, 1);
    if (startDateISO > endDateISO) return null;
    return { start: startOfDayISO(startDateISO), end: endOfDayISO(endDateISO) };
  }
}

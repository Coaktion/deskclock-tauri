import type { Task } from "@domain/entities/Task";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { TaskRepository } from "@infra/database/TaskRepository";
import { GoogleSheetsTaskSender } from "./GoogleSheetsTaskSender";
import { ClockifyTaskSender } from "./ClockifyTaskSender";
import { groupTasks } from "@shared/utils/groupTasks";
import { startOfDayISO, endOfDayISO, addDaysISO, todayISO } from "@shared/utils/time";

export interface AutoSyncResult {
  integration: string;
  count: number;
  error?: Error;
}

export class AutoSyncRunner {
  private taskRepo = new TaskRepository();

  constructor(
    private config: ConfigContextValue,
    private logRepo: ITaskIntegrationLogRepository
  ) {}

  // Called immediately after each task is stopped/completed.
  // Returns results for all integrations; never throws.
  async runPerTask(task: Task): Promise<AutoSyncResult[]> {
    const jobs: Promise<AutoSyncResult>[] = [];

    if (this.isSheetsPerTaskEnabled()) {
      jobs.push(this.sheetsPerTask(task));
    }
    if (this.isClockifyPerTaskEnabled()) {
      jobs.push(this.clockifyPerTask(task));
    }

    return Promise.all(jobs);
  }

  // Called on app open or at a fixed time.
  // endDateISO: the last date to include (ISO date, no time).
  async runDaily(endDateISO: string): Promise<AutoSyncResult[]> {
    const lastSheetsTs = this.config.get("sheetsDailySyncLastTimestamp");
    const lastClockifyTs = this.config.get("clockifyDailySyncLastTimestamp");

    const jobs: Promise<AutoSyncResult>[] = [];

    if (this.isSheetsDaily()) {
      const range = this.calcRange(lastSheetsTs, endDateISO);
      if (range) {
        jobs.push(this.sheetsDaily(range.start, range.end));
      }
    }

    if (this.isClockifyDaily()) {
      const range = this.calcRange(lastClockifyTs, endDateISO);
      if (range) {
        jobs.push(this.clockifyDaily(range.start, range.end));
      }
    }

    return Promise.all(jobs);
  }

  // ── Sheets ──────────────────────────────────────────────────────────

  private isSheetsPerTaskEnabled(): boolean {
    return (
      this.config.get("integrationGoogleSheetsAutoSync") &&
      this.config.get("sheetsAutoSyncMode") === "per-task" &&
      !!this.config.get("integrationGoogleSheetsSpreadsheetId") &&
      !!this.config.get("googleRefreshToken")
    );
  }

  private isSheetsDaily(): boolean {
    return (
      this.config.get("integrationGoogleSheetsAutoSync") &&
      this.config.get("sheetsAutoSyncMode") === "daily" &&
      !!this.config.get("integrationGoogleSheetsSpreadsheetId") &&
      !!this.config.get("googleRefreshToken")
    );
  }

  private async sheetsPerTask(task: Task): Promise<AutoSyncResult> {
    try {
      const spreadsheetId = this.config.get("integrationGoogleSheetsSpreadsheetId");
      const [projects, categories] = await Promise.all([
        new ProjectRepository().findAll(),
        new CategoryRepository().findAll(),
      ]);
      const sender = new GoogleSheetsTaskSender(this.config, spreadsheetId, projects, categories);
      await sender.send([task]);
      await this.logRepo.markSent([task.id], "google_sheets");
      await this.config.set("sheetsDailySyncLastTimestamp", new Date().toISOString());
      return { integration: "google_sheets", count: 1 };
    } catch (err) {
      return { integration: "google_sheets", count: 0, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  private async sheetsDaily(startISO: string, endISO: string): Promise<AutoSyncResult> {
    try {
      const spreadsheetId = this.config.get("integrationGoogleSheetsSpreadsheetId");
      const [tasks, projects, categories] = await Promise.all([
        this.taskRepo.findByDateRange(startISO, endISO),
        new ProjectRepository().findAll(),
        new CategoryRepository().findAll(),
      ]);
      const completed = tasks.filter((t) => t.status === "completed");
      if (completed.length === 0) return { integration: "google_sheets", count: 0 };

      const sentIds = new Set(await this.logRepo.findSentIds("google_sheets", startISO, endISO));
      const groups = groupTasks(completed).filter((g) => !g.tasks.every((t) => sentIds.has(t.id)));
      if (groups.length === 0) return { integration: "google_sheets", count: 0 };

      const tasksToSend = groups.map((g) => ({ ...g.tasks[0], durationSeconds: g.totalSeconds }));
      const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id));
      const sender = new GoogleSheetsTaskSender(this.config, spreadsheetId, projects, categories);
      await sender.send(tasksToSend);
      await this.logRepo.markSent(allIds, "google_sheets");
      await this.config.set("sheetsDailySyncLastTimestamp", new Date().toISOString());
      return { integration: "google_sheets", count: groups.length };
    } catch (err) {
      return { integration: "google_sheets", count: 0, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ── Clockify ────────────────────────────────────────────────────────

  private isClockifyPerTaskEnabled(): boolean {
    return (
      this.config.get("clockifyAutoSync") &&
      this.config.get("clockifyAutoSyncMode") === "per-task" &&
      !!this.config.get("clockifyApiKey") &&
      !!this.config.get("clockifyActiveWorkspaceId")
    );
  }

  private isClockifyDaily(): boolean {
    return (
      this.config.get("clockifyAutoSync") &&
      this.config.get("clockifyAutoSyncMode") === "daily" &&
      !!this.config.get("clockifyApiKey") &&
      !!this.config.get("clockifyActiveWorkspaceId")
    );
  }

  private async clockifyPerTask(task: Task): Promise<AutoSyncResult> {
    try {
      const sender = new ClockifyTaskSender(this.config);
      await sender.send([task]);
      await this.logRepo.markSent([task.id], "clockify");
      await this.config.set("clockifyDailySyncLastTimestamp", new Date().toISOString());
      return { integration: "clockify", count: 1 };
    } catch (err) {
      return { integration: "clockify", count: 0, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  private async clockifyDaily(startISO: string, endISO: string): Promise<AutoSyncResult> {
    try {
      const tasks = await this.taskRepo.findByDateRange(startISO, endISO);
      const completed = tasks.filter((t) => t.status === "completed");
      if (completed.length === 0) return { integration: "clockify", count: 0 };

      const sentIds = new Set(await this.logRepo.findSentIds("clockify", startISO, endISO));
      const groups = groupTasks(completed).filter((g) => !g.tasks.every((t) => sentIds.has(t.id)));
      if (groups.length === 0) return { integration: "clockify", count: 0 };

      const tasksToSend = groups.map((g) => ({ ...g.tasks[0], durationSeconds: g.totalSeconds }));
      const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id));
      const sender = new ClockifyTaskSender(this.config);
      await sender.send(tasksToSend);
      await this.logRepo.markSent(allIds, "clockify");
      await this.config.set("clockifyDailySyncLastTimestamp", new Date().toISOString());
      return { integration: "clockify", count: groups.length };
    } catch (err) {
      return { integration: "clockify", count: 0, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private calcRange(
    lastTimestamp: string,
    endDateISO: string
  ): { start: string; end: string } | null {
    const lastDateISO = lastTimestamp
      ? new Date(lastTimestamp).toLocaleDateString("sv-SE")
      : addDaysISO(todayISO(), -7);
    const startDateISO = addDaysISO(lastDateISO, 1);
    if (startDateISO > endDateISO) return null;
    return { start: startOfDayISO(startDateISO), end: endOfDayISO(endDateISO) };
  }
}

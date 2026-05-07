import type { Task } from "@domain/entities/Task";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { IGoogleAuthPort } from "@domain/integrations/IGoogleAuthPort";
import type { ISheetsConfigPort } from "@domain/integrations/ISheetsConfigPort";
import { validateTaskForSheets, formatMissingFields } from "@domain/integrations/taskValidation";
import { runDailyTemplate } from "./runDailyTemplate";
import { GoogleSheetsTaskSender } from "./GoogleSheetsTaskSender";

export class SheetsSyncStrategy implements ISyncStrategy {
  readonly integrationName = "Google Sheets";

  constructor(
    private config: ISheetsConfigPort & IGoogleAuthPort,
    private taskRepo: ITaskRepository,
    private projectRepo: IProjectRepository,
    private categoryRepo: ICategoryRepository,
    private logRepo: ITaskIntegrationLogRepository
  ) {}

  isPerTaskEnabled(): boolean {
    return (
      this.config.get("integrationGoogleSheetsAutoSync") &&
      this.config.get("sheetsAutoSyncMode") === "per-task" &&
      !!this.config.get("integrationGoogleSheetsSpreadsheetId") &&
      !!this.config.get("googleRefreshToken")
    );
  }

  isDailyEnabled(): boolean {
    return (
      this.config.get("integrationGoogleSheetsAutoSync") &&
      this.config.get("sheetsAutoSyncMode") === "daily" &&
      !!this.config.get("integrationGoogleSheetsSpreadsheetId") &&
      !!this.config.get("googleRefreshToken")
    );
  }

  async runPerTask(task: Task): Promise<AutoSyncResult> {
    const validation = validateTaskForSheets(task);
    if (!validation.ok) {
      return {
        integration: this.integrationName,
        count: 0,
        warning: `Tarefa não enviada ao Google Sheets: faltam ${formatMissingFields(validation.missing)}.`,
      };
    }
    try {
      const spreadsheetId = this.config.get("integrationGoogleSheetsSpreadsheetId");
      const [projects, categories] = await Promise.all([
        this.projectRepo.findAll(),
        this.categoryRepo.findAll(),
      ]);
      const sender = new GoogleSheetsTaskSender(this.config, spreadsheetId, projects, categories);
      await sender.send([task]);
      await this.logRepo.markSent([task.id], "google_sheets");
      await this.config.set("sheetsDailySyncLastTimestamp", new Date().toISOString());
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
        integrationLabel: "Google Sheets",
        logKey: "google_sheets",
        taskRepo: this.taskRepo,
        logRepo: this.logRepo,
        timestampPort: {
          get: () => this.config.get("sheetsDailySyncLastTimestamp"),
          set: (iso) => this.config.set("sheetsDailySyncLastTimestamp", iso),
        },
        validate: (t) => validateTaskForSheets(t).ok,
        createSender: async () => {
          const [projects, categories] = await Promise.all([
            this.projectRepo.findAll(),
            this.categoryRepo.findAll(),
          ]);
          return new GoogleSheetsTaskSender(
            this.config,
            this.config.get("integrationGoogleSheetsSpreadsheetId"),
            projects,
            categories
          );
        },
      },
      endDateISO
    );
  }
}

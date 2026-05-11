import type { AppConfig } from "@shared/types/appConfig";

export type SheetsConfigKey =
  | "integrationGoogleSheetsAutoSync"
  | "sheetsAutoSyncMode"
  | "integrationGoogleSheetsSpreadsheetId"
  | "integrationGoogleSheetsSheetName"
  | "integrationGoogleSheetsColumnMapping"
  | "sheetsDailySyncLastTimestamp";

export interface ISheetsConfigPort {
  get<K extends SheetsConfigKey>(key: K): AppConfig[K];
  set<K extends SheetsConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

import type { AppConfig } from "@shared/types/appConfig";

export type MondayConfigKey =
  | "mondayApiKey"
  | "mondayUserId"
  | "mondayPortfolioBoardId"
  | "mondayReportBoardId"
  | "mondayProjectMapping"
  | "mondayFieldCatalogs"
  | "mondayProjectStageFieldId"
  | "mondayReportTypeFieldId"
  | "mondayNonBillableReasonFieldId"
  | "mondayAutoSync"
  | "mondayAutoSyncMode"
  | "mondayDailySyncLastTimestamp";

export interface IMondayConfigPort {
  get<K extends MondayConfigKey>(key: K): AppConfig[K];
  set<K extends MondayConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

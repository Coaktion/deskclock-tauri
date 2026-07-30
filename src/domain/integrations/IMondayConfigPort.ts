import type { AppConfig } from "@shared/types/appConfig";

export type MondayConfigKey =
  | "mondayApiKey"
  | "mondayUserId"
  | "mondayActiveWorkspaceId"
  | "mondayProjectMapping"
  | "mondayCategoryMapping"
  | "mondayAutoSync"
  | "mondayAutoSyncMode"
  | "mondayDailySyncLastTimestamp";

export interface IMondayConfigPort {
  get<K extends MondayConfigKey>(key: K): AppConfig[K];
  set<K extends MondayConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

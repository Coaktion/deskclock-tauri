import type { AppConfig } from "@shared/types/appConfig";

export type ClockifyConfigKey =
  | "clockifyAutoSync"
  | "clockifyAutoSyncMode"
  | "clockifyApiKey"
  | "clockifyActiveWorkspaceId"
  | "clockifyProjectMapping"
  | "clockifyCategoryMapping"
  | "clockifyDefaultTagIds"
  | "clockifyDailySyncLastTimestamp"
  | "clockifyDeskclockWorkspaceId";

export interface IClockifyConfigPort {
  get<K extends ClockifyConfigKey>(key: K): AppConfig[K];
  set<K extends ClockifyConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

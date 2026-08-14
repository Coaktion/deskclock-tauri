import type { AppConfig } from "@shared/types/appConfig";

/**
 * Porta estreita: o backup enxerga as seis chaves dele, e nenhuma outra. É o
 * mesmo molde do `ISheetsConfigPort` — quem recebe a porta não alcança os
 * tokens que o próprio backup expurga do snapshot.
 */
export type DriveBackupConfigKey =
  | "driveBackupEnabled"
  | "driveBackupFrequency"
  | "driveBackupFolderId"
  | "driveBackupLastRunAt"
  | "driveBackupLastError"
  | "driveBackupKeepCount";

export interface IDriveBackupPort {
  get<K extends DriveBackupConfigKey>(key: K): AppConfig[K];
  set<K extends DriveBackupConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

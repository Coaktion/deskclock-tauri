import type { AppConfig } from "@shared/types/appConfig";

export type GoogleAuthKey =
  "googleAccessToken" | "googleRefreshToken" | "googleTokenExpiry" | "googleUserEmail";

export interface IGoogleAuthPort {
  get<K extends GoogleAuthKey>(key: K): AppConfig[K];
  set<K extends GoogleAuthKey>(key: K, value: AppConfig[K]): Promise<void>;
}

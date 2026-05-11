import type { AppConfig } from "@shared/types/appConfig";

export type ZendeskAuthKey =
  | "zendeskSubdomain"
  | "zendeskClientId"
  | "zendeskClientSecret"
  | "zendeskAccessToken"
  | "zendeskRefreshToken"
  | "zendeskTokenExpiry"
  | "zendeskUserEmail";

export interface IZendeskAuthPort {
  get<K extends ZendeskAuthKey>(key: K): AppConfig[K];
  set<K extends ZendeskAuthKey>(key: K, value: AppConfig[K]): Promise<void>;
}

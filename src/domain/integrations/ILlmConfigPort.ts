import type { AppConfig } from "@shared/types/appConfig";

export type LlmConfigKey = "llmProviderId" | "llmBaseUrl" | "llmApiKey" | "llmModel";

export interface ILlmConfigPort {
  get<K extends LlmConfigKey>(key: K): AppConfig[K];
  set<K extends LlmConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

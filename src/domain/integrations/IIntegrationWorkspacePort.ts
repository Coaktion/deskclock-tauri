import type { AppConfig, IntegrationWorkspaceKey } from "@shared/types/appConfig";

/**
 * Chaves que dizem **em que workspace cada integração trabalha** e **se ela está
 * conectada**. As de conexão entram porque avisar sobre uma integração que
 * ninguém configurou é alarme falso.
 */
export type IntegrationWorkspaceReadKey =
  | IntegrationWorkspaceKey
  | "mondayApiKey"
  | "clockifyApiKey"
  | "googleRefreshToken"
  | "zendeskAccessToken";

export interface IIntegrationWorkspacePort {
  get<K extends IntegrationWorkspaceReadKey>(key: K): AppConfig[K];
}

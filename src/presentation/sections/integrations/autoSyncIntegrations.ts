import type { AppConfig } from "@shared/types/appConfig";
import {
  SHEETS_INTEGRATION_NAME,
  CLOCKIFY_INTEGRATION_NAME,
  MONDAY_INTEGRATION_NAME,
} from "@presentation/contexts/AutoSyncContext";

type KeysOfType<T> = {
  [K in keyof AppConfig]: AppConfig[K] extends T ? K : never;
}[keyof AppConfig];

/**
 * Chaves de `AppConfig` que uma integração usa para envio automático. Cada
 * integração declara as suas — os controles são idênticos, só o destino da
 * persistência muda.
 */
export interface AutoSyncConfigKeys {
  enabled: KeysOfType<boolean>;
  mode: KeysOfType<"per-task" | "daily">;
  trigger: KeysOfType<"on-open" | "fixed-time">;
  time: KeysOfType<string>;
  /** Timestamp do último envio concluído — é o "Último envio" da tela. */
  lastSync: KeysOfType<string>;
  /** Marca de "já disparou hoje neste horário", do agendador de horário fixo. */
  lastFired: KeysOfType<string>;
}

export interface AutoSyncIntegration {
  /** Nome no `AutoSyncRunner`; é por ele que o disparo escolhe a estratégia. */
  integrationName: string;
  keys: AutoSyncConfigKeys;
}

export const SHEETS_AUTO_SYNC_KEYS: AutoSyncConfigKeys = {
  enabled: "integrationGoogleSheetsAutoSync",
  mode: "sheetsAutoSyncMode",
  trigger: "sheetsAutoSyncTrigger",
  time: "sheetsAutoSyncTime",
  lastSync: "sheetsDailySyncLastTimestamp",
  lastFired: "sheetsAutoSyncLastFiredDate",
};

export const CLOCKIFY_AUTO_SYNC_KEYS: AutoSyncConfigKeys = {
  enabled: "clockifyAutoSync",
  mode: "clockifyAutoSyncMode",
  trigger: "clockifyAutoSyncTrigger",
  time: "clockifyAutoSyncTime",
  lastSync: "clockifyDailySyncLastTimestamp",
  lastFired: "clockifyAutoSyncLastFiredDate",
};

export const MONDAY_AUTO_SYNC_KEYS: AutoSyncConfigKeys = {
  enabled: "mondayAutoSync",
  mode: "mondayAutoSyncMode",
  trigger: "mondayAutoSyncTrigger",
  time: "mondayAutoSyncTime",
  lastSync: "mondayDailySyncLastTimestamp",
  lastFired: "mondayAutoSyncLastFiredDate",
};

/**
 * **Registro único das integrações com envio automático.**
 *
 * A tela e o agendador liam essas chaves em lugares separados, e o agendador
 * simplesmente não conhecia o Monday: as chaves existiam na config, a tela as
 * gravava e nenhum código as lia — o horário fixo nunca disparava. Com uma
 * lista só, integração nova entra aqui uma vez e os dois lados a enxergam.
 */
export const AUTO_SYNC_INTEGRATIONS: AutoSyncIntegration[] = [
  { integrationName: SHEETS_INTEGRATION_NAME, keys: SHEETS_AUTO_SYNC_KEYS },
  { integrationName: CLOCKIFY_INTEGRATION_NAME, keys: CLOCKIFY_AUTO_SYNC_KEYS },
  { integrationName: MONDAY_INTEGRATION_NAME, keys: MONDAY_AUTO_SYNC_KEYS },
];

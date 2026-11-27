import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { normalizeSheetName } from "@domain/usecases/settings/integrationSettingsRules";
import { isLlmConnected } from "@presentation/integrations/llmConnection";
import {
  SHEETS_AUTO_SYNC_KEYS,
  type AutoSyncConfigKeys,
} from "@presentation/integrations/autoSyncIntegrations";
import type {
  AppConfig,
  BackupFrequency,
  ConfigContextValue,
  IntegrationWorkspaceKey,
} from "@shared/types/appConfig";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";
import { DEFAULT_COLUMN_MAPPING, type SheetColumnMapping } from "@shared/types/sheetsConfig";

/**
 * Os ajustes **não secretos** de cada integração, como a tela de Integrações os
 * mostra e grava (`docs-internal/specs/mcp.md` §7, Fase D3b). Uma porta estreita
 * por integração, como a das Configurações (`settingsGroups.ts`): cada chave
 * tem tipo próprio, e o que é segredo (chave de API, token, client secret),
 * estado interno (cache, carimbo, id de sincronização) ou conexão nunca entra —
 * de cada integração a leitura diz só se está conectada.
 *
 * A validação mora nos handlers da API; aqui chega o que já passou por ela.
 * Nenhuma chave daqui tem efeito além de gravar: agendadores, rastreadores e
 * estratégias leem a config na hora (`useDailySyncScheduler`,
 * `useDriveBackupScheduler`, `useMeetingTracker`, `useMondayItemTracker`).
 */

export type IntegrationSettingsConfig = Pick<ConfigContextValue, "get" | "set">;

export type AutoSyncMode = AppConfig["mondayAutoSyncMode"];
export type AutoSyncTrigger = AppConfig["mondayAutoSyncTrigger"];

/** Os controles de "Envio automático", iguais nas três integrações que enviam horas. */
export interface AutoSyncSettings {
  autoSyncEnabled: boolean;
  autoSyncMode: AutoSyncMode;
  autoSyncTrigger: AutoSyncTrigger;
  /** `HH:MM`, só usado no gatilho de horário fixo. */
  autoSyncTime: string;
}

interface Connected {
  connected: boolean;
}

interface WithWorkspace {
  /** Workspace do DeskClock da integração; vazio na config resolve para o "Padrão". */
  workspaceId: string;
}

export interface SheetsSettings extends Connected, WithWorkspace, AutoSyncSettings {
  spreadsheetId: string;
  sheetName: string;
  columnMapping: SheetColumnMapping;
  durationFormat: AppConfig["integrationGoogleSheetsDurationFormat"];
}

export interface CalendarSettings extends Connected, WithWorkspace {
  autoTrackingEnabled: boolean;
  ignoreRules: CalendarIgnoreRule[];
}

export interface DriveBackupSettings extends Connected {
  enabled: boolean;
  frequency: BackupFrequency;
}

export interface ZendeskSettings extends Connected, WithWorkspace {}

export interface LlmSettings extends Connected {
  /** O preset escolhido (ou `custom`). A URL base fica de fora: pode carregar credencial. */
  providerId: string;
  model: string;
}

export type SheetsSettingsPatch = Partial<Omit<SheetsSettings, "connected">>;
export type CalendarSettingsPatch = Partial<
  Pick<CalendarSettings, "workspaceId" | "autoTrackingEnabled">
>;
export type DriveBackupSettingsPatch = Partial<Omit<DriveBackupSettings, "connected">>;
export type ZendeskSettingsPatch = Partial<WithWorkspace>;

export function readAutoSync(
  config: IntegrationSettingsConfig,
  keys: AutoSyncConfigKeys
): AutoSyncSettings {
  return {
    autoSyncEnabled: config.get(keys.enabled),
    autoSyncMode: config.get(keys.mode),
    autoSyncTrigger: config.get(keys.trigger),
    autoSyncTime: config.get(keys.time),
  };
}

export async function writeAutoSync(
  config: IntegrationSettingsConfig,
  keys: AutoSyncConfigKeys,
  patch: Partial<AutoSyncSettings>
): Promise<void> {
  if (patch.autoSyncEnabled !== undefined) await config.set(keys.enabled, patch.autoSyncEnabled);
  if (patch.autoSyncMode !== undefined) await config.set(keys.mode, patch.autoSyncMode);
  if (patch.autoSyncTrigger !== undefined) await config.set(keys.trigger, patch.autoSyncTrigger);
  if (patch.autoSyncTime !== undefined) await config.set(keys.time, patch.autoSyncTime);
}

export function readWorkspace(config: IntegrationSettingsConfig, key: IntegrationWorkspaceKey) {
  return resolveIntegrationWorkspaceId(config.get(key));
}

/** Como o seletor "Workspace DeskClock": grava o id escolhido, sem outro efeito. */
export async function writeWorkspace(
  config: IntegrationSettingsConfig,
  key: IntegrationWorkspaceKey,
  workspaceId: string | undefined
): Promise<void> {
  if (workspaceId !== undefined) await config.set(key, workspaceId);
}

export const googleConnected = (config: IntegrationSettingsConfig) =>
  !!config.get("googleRefreshToken");

export function readSheets(config: IntegrationSettingsConfig): SheetsSettings {
  return {
    connected: googleConnected(config),
    workspaceId: readWorkspace(config, "sheetsDeskclockWorkspaceId"),
    spreadsheetId: config.get("integrationGoogleSheetsSpreadsheetId"),
    sheetName: normalizeSheetName(config.get("integrationGoogleSheetsSheetName") ?? ""),
    columnMapping: config.get("integrationGoogleSheetsColumnMapping") ?? DEFAULT_COLUMN_MAPPING,
    durationFormat: config.get("integrationGoogleSheetsDurationFormat") ?? "HH:MM",
    ...readAutoSync(config, SHEETS_AUTO_SYNC_KEYS),
  };
}

/** Como os campos da subseção Google Sheets: id aparado e aba em branco = DeskClock. */
export async function writeSheets(
  config: IntegrationSettingsConfig,
  patch: SheetsSettingsPatch
): Promise<SheetsSettings> {
  await writeWorkspace(config, "sheetsDeskclockWorkspaceId", patch.workspaceId);
  if (patch.spreadsheetId !== undefined) {
    await config.set("integrationGoogleSheetsSpreadsheetId", patch.spreadsheetId.trim());
  }
  if (patch.sheetName !== undefined) {
    await config.set("integrationGoogleSheetsSheetName", normalizeSheetName(patch.sheetName));
  }
  if (patch.columnMapping !== undefined) {
    // Item a item, só com as três chaves: o que vier a mais no objeto não chega
    // à config nem volta na resposta.
    await config.set(
      "integrationGoogleSheetsColumnMapping",
      patch.columnMapping.map(({ field, label, enabled }) => ({ field, label, enabled }))
    );
  }
  if (patch.durationFormat !== undefined) {
    await config.set("integrationGoogleSheetsDurationFormat", patch.durationFormat);
  }
  await writeAutoSync(config, SHEETS_AUTO_SYNC_KEYS, patch);
  return readSheets(config);
}

export function readCalendar(config: IntegrationSettingsConfig): CalendarSettings {
  return {
    connected: googleConnected(config),
    workspaceId: readWorkspace(config, "calendarDeskclockWorkspaceId"),
    autoTrackingEnabled: config.get("calendarAutoTrackingEnabled"),
    ignoreRules: config.get("calendarIgnoreRules"),
  };
}

export async function writeCalendar(
  config: IntegrationSettingsConfig,
  patch: CalendarSettingsPatch
): Promise<CalendarSettings> {
  await writeWorkspace(config, "calendarDeskclockWorkspaceId", patch.workspaceId);
  if (patch.autoTrackingEnabled !== undefined) {
    await config.set("calendarAutoTrackingEnabled", patch.autoTrackingEnabled);
  }
  return readCalendar(config);
}

export function readDriveBackup(config: IntegrationSettingsConfig): DriveBackupSettings {
  return {
    connected: googleConnected(config),
    enabled: config.get("driveBackupEnabled"),
    frequency: config.get("driveBackupFrequency"),
  };
}

export async function writeDriveBackup(
  config: IntegrationSettingsConfig,
  patch: DriveBackupSettingsPatch
): Promise<DriveBackupSettings> {
  if (patch.enabled !== undefined) await config.set("driveBackupEnabled", patch.enabled);
  if (patch.frequency !== undefined) await config.set("driveBackupFrequency", patch.frequency);
  return readDriveBackup(config);
}

export function readZendesk(config: IntegrationSettingsConfig): ZendeskSettings {
  return {
    connected: !!config.get("zendeskAccessToken"),
    workspaceId: readWorkspace(config, "zendeskDeskclockWorkspaceId"),
  };
}

export async function writeZendesk(
  config: IntegrationSettingsConfig,
  patch: ZendeskSettingsPatch
): Promise<ZendeskSettings> {
  await writeWorkspace(config, "zendeskDeskclockWorkspaceId", patch.workspaceId);
  return readZendesk(config);
}

export function readLlm(config: IntegrationSettingsConfig): LlmSettings {
  return {
    connected: isLlmConnected(config.get("llmBaseUrl"), config.get("llmModel")),
    providerId: config.get("llmProviderId"),
    model: config.get("llmModel"),
  };
}

import type { AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import { addIgnoreRule, removeIgnoreRule } from "@domain/usecases/calendar/isEventIgnored";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";
import {
  buildClockifyPort,
  type ClockifySettingsDeps,
  type ClockifySettingsPort,
} from "./clockifySettingsPort";
import {
  readCalendar,
  readDriveBackup,
  readLlm,
  readSheets,
  readZendesk,
  writeCalendar,
  writeDriveBackup,
  writeSheets,
  writeZendesk,
  type CalendarSettings,
  type CalendarSettingsPatch,
  type DriveBackupSettings,
  type DriveBackupSettingsPatch,
  type LlmSettings,
  type SheetsSettings,
  type SheetsSettingsPatch,
  type ZendeskSettings,
  type ZendeskSettingsPatch,
} from "./integrationSettings";
import {
  buildMondayPort,
  type MondaySettingsDeps,
  type MondaySettingsPort,
} from "./mondaySettingsPort";

export type { ClockifySettings, ClockifySettingsPatch } from "./clockifySettingsPort";
export type {
  MondayCatalogFieldState,
  MondayProjectRef,
  MondaySettings,
  MondaySettingsPatch,
} from "./mondaySettingsPort";

// A porta que a API local recebe para os ajustes das integrações
// (`docs-internal/specs/mcp.md` §7, Fase D3b): compõe os grupos simples
// (`integrationSettings.ts`), o Clockify e o Monday, que passam pelo serviço.

export type AutoSyncNowIntegration = "google_sheets" | "monday";

export interface IntegrationSettingsPort extends ClockifySettingsPort, MondaySettingsPort {
  sheets(): SheetsSettings;
  updateSheets(patch: SheetsSettingsPatch): Promise<SheetsSettings>;
  calendar(): CalendarSettings;
  updateCalendar(patch: CalendarSettingsPatch): Promise<CalendarSettings>;
  /** Devolve as regras como ficaram e se a regra entrou (repetida não entra). */
  addCalendarIgnoreRule(
    rule: CalendarIgnoreRule
  ): Promise<{ added: boolean; rules: CalendarIgnoreRule[] }>;
  removeCalendarIgnoreRule(
    rule: CalendarIgnoreRule
  ): Promise<{ removed: boolean; rules: CalendarIgnoreRule[] }>;
  driveBackup(): DriveBackupSettings;
  updateDriveBackup(patch: DriveBackupSettingsPatch): Promise<DriveBackupSettings>;
  zendesk(): ZendeskSettings;
  updateZendesk(patch: ZendeskSettingsPatch): Promise<ZendeskSettings>;
  llm(): LlmSettings;
  /** O "Enviar agora" do envio diário; `null` = integração fora do runner. */
  runAutoSyncNow(integration: AutoSyncNowIntegration): Promise<AutoSyncResult | null>;
}

export interface IntegrationSettingsDeps
  extends Omit<ClockifySettingsDeps, "factories">, Omit<MondaySettingsDeps, "factories"> {
  factories: ClockifySettingsDeps["factories"] & MondaySettingsDeps["factories"];
  /** O nome de cada integração no `AutoSyncRunner`. */
  autoSyncNames: Record<AutoSyncNowIntegration, string>;
  runDailyFor(integrationName: string, endDateISO: string): Promise<AutoSyncResult | null>;
  todayISO: () => string;
}

export function buildIntegrationSettingsPort(
  deps: IntegrationSettingsDeps
): IntegrationSettingsPort {
  const { config } = deps;
  return {
    ...buildClockifyPort(deps),
    ...buildMondayPort(deps),
    sheets: () => readSheets(config),
    updateSheets: (patch) => writeSheets(config, patch),
    calendar: () => readCalendar(config),
    updateCalendar: (patch) => writeCalendar(config, patch),
    async addCalendarIgnoreRule(rule) {
      const current = config.get("calendarIgnoreRules");
      const next = addIgnoreRule(current, rule);
      if (next !== current) await config.set("calendarIgnoreRules", next);
      return { added: next !== current, rules: next };
    },
    async removeCalendarIgnoreRule(rule) {
      const current = config.get("calendarIgnoreRules");
      const next = removeIgnoreRule(current, rule);
      if (next !== current) await config.set("calendarIgnoreRules", next);
      return { removed: next !== current, rules: next };
    },
    driveBackup: () => readDriveBackup(config),
    updateDriveBackup: (patch) => writeDriveBackup(config, patch),
    zendesk: () => readZendesk(config),
    updateZendesk: (patch) => writeZendesk(config, patch),
    llm: () => readLlm(config),
    runAutoSyncNow: (integration) =>
      deps.runDailyFor(deps.autoSyncNames[integration], deps.todayISO()),
  };
}

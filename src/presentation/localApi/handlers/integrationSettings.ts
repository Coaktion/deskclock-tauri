import { linkableCatalogFields } from "@domain/usecases/monday/mondayCatalogFields";
import {
  AUTO_SYNC_MODES,
  AUTO_SYNC_TRIGGERS,
  BACKUP_FREQUENCIES,
  SHEETS_DURATION_FORMATS,
  isSheetColumnMapping,
  isTimeOfDay,
} from "@domain/usecases/settings/integrationSettingsRules";
import type {
  AutoSyncSettings,
  CalendarSettingsPatch,
  DriveBackupSettingsPatch,
  SheetsSettingsPatch,
  ZendeskSettingsPatch,
} from "@presentation/settings/integrationSettings";
import type {
  ClockifySettingsPatch,
  MondaySettingsPatch,
} from "@presentation/settings/integrationSettingsPort";
import { ConflictError } from "../errors";
import { boolean, oneOf, parsePatch, text, type Validator } from "../patchRules";
import type { LocalApiDeps, LocalApiHandler } from "../types";

/**
 * Os ajustes não secretos das integrações (Fase D3b da paridade): leitura e
 * edição parcial por integração, como as Configurações da D3a. Ausente mantém;
 * o que a tela não deixa escolher é 400; referência a workspace, campo ou
 * workspace do Clockify que não existe é 409. Como a tela, que só mostra os
 * controles com a integração conectada, editar sem conexão é 409.
 *
 * Conectar (chaves, OAuth, tokens) não passa por aqui, e nenhum segredo sai:
 * cada leitura diz só se a integração está conectada.
 */

export const GOOGLE_NOT_CONNECTED = "Google não conectado. Conecte o Google em Integrações.";
export const CLOCKIFY_NOT_CONNECTED = "Clockify não conectado. Conecte o Clockify em Integrações.";
export const MONDAY_NOT_CONNECTED = "Monday não conectado. Conecte o Monday em Integrações.";
export const ZENDESK_NOT_CONNECTED = "Zendesk não conectado. Conecte o Zendesk em Integrações.";

const timeOfDay: Validator = (value, key) =>
  isTimeOfDay(value) ? null : `${key} deve ser um horário HH:MM (00:00 a 23:59).`;

const columnMapping: Validator = (value, key) =>
  isSheetColumnMapping(value)
    ? null
    : `${key} deve ser a lista das oito colunas (date, name, project, category, billable, startTime, endTime, duration), cada uma uma vez, com { field, label, enabled }.`;

const AUTO_SYNC_RULES: Record<keyof AutoSyncSettings, Validator> = {
  autoSyncEnabled: boolean,
  autoSyncMode: oneOf(AUTO_SYNC_MODES),
  autoSyncTrigger: oneOf(AUTO_SYNC_TRIGGERS),
  autoSyncTime: timeOfDay,
};

const SHEETS_RULES: Record<keyof SheetsSettingsPatch, Validator> = {
  workspaceId: text,
  spreadsheetId: text,
  sheetName: text,
  columnMapping,
  durationFormat: oneOf(SHEETS_DURATION_FORMATS),
  ...AUTO_SYNC_RULES,
};

const CALENDAR_RULES: Record<keyof CalendarSettingsPatch, Validator> = {
  workspaceId: text,
  autoTrackingEnabled: boolean,
};

const DRIVE_BACKUP_RULES: Record<keyof DriveBackupSettingsPatch, Validator> = {
  enabled: boolean,
  frequency: oneOf(BACKUP_FREQUENCIES),
};

const CLOCKIFY_RULES: Record<keyof ClockifySettingsPatch, Validator> = {
  workspaceId: text,
  clockifyWorkspaceId: text,
  ...AUTO_SYNC_RULES,
};

const MONDAY_RULES: Record<keyof MondaySettingsPatch, Validator> = {
  workspaceId: text,
  portfolioBoardId: text,
  reportBoardId: text,
  autoImportEnabled: boolean,
  projectStageFieldId: text,
  nonBillableReasonFieldId: text,
  ...AUTO_SYNC_RULES,
};

const ZENDESK_RULES: Record<keyof ZendeskSettingsPatch, Validator> = { workspaceId: text };

export function assertConnected(connected: boolean, message: string) {
  if (!connected) throw new ConflictError(message);
}

/** O seletor "Workspace DeskClock" só oferece workspace que existe. */
async function assertWorkspace(deps: LocalApiDeps, workspaceId: string | undefined) {
  if (workspaceId === undefined) return;
  if (!(await deps.workspaceRepo.findById(workspaceId))) {
    throw new ConflictError(`Workspace '${workspaceId}' não encontrado`);
  }
}

export const getSheetsSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.integrationSettings.sheets(),
});

export const updateSheetsSettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<SheetsSettingsPatch>(params.body, SHEETS_RULES, "Google Sheets");
  assertConnected(deps.integrationSettings.sheets().connected, GOOGLE_NOT_CONNECTED);
  await assertWorkspace(deps, patch.workspaceId);
  return { status: 200, body: await deps.integrationSettings.updateSheets(patch) };
};

export const getCalendarSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.integrationSettings.calendar(),
});

export const updateCalendarSettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<CalendarSettingsPatch>(params.body, CALENDAR_RULES, "Google Agenda");
  assertConnected(deps.integrationSettings.calendar().connected, GOOGLE_NOT_CONNECTED);
  await assertWorkspace(deps, patch.workspaceId);
  return { status: 200, body: await deps.integrationSettings.updateCalendar(patch) };
};

export const getDriveBackupSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.integrationSettings.driveBackup(),
});

export const updateDriveBackupSettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<DriveBackupSettingsPatch>(
    params.body,
    DRIVE_BACKUP_RULES,
    "Backup no Drive"
  );
  assertConnected(deps.integrationSettings.driveBackup().connected, GOOGLE_NOT_CONNECTED);
  return { status: 200, body: await deps.integrationSettings.updateDriveBackup(patch) };
};

export const getClockifySettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.integrationSettings.clockify(),
});

export const updateClockifySettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<ClockifySettingsPatch>(params.body, CLOCKIFY_RULES, "Clockify");
  const port = deps.integrationSettings;
  assertConnected(port.clockify().connected, CLOCKIFY_NOT_CONNECTED);
  await assertWorkspace(deps, patch.workspaceId);
  if (
    patch.clockifyWorkspaceId !== undefined &&
    !port.clockifyCachedWorkspaces().some((w) => w.id === patch.clockifyWorkspaceId)
  ) {
    throw new ConflictError(
      `Workspace do Clockify '${patch.clockifyWorkspaceId}' não está na lista. Atualize a lista de workspaces do Clockify e escolha um dela.`
    );
  }
  return { status: 200, body: await port.updateClockify(patch) };
};

export const getMondaySettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: await deps.integrationSettings.monday(),
});

export const updateMondaySettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<MondaySettingsPatch>(params.body, MONDAY_RULES, "Monday");
  const port = deps.integrationSettings;
  const current = await port.monday();
  assertConnected(current.connected, MONDAY_NOT_CONNECTED);
  await assertWorkspace(deps, patch.workspaceId);
  const fields = await port.customFields();
  const linkable = (wanted: string | undefined, linkedId: string, title: string) => {
    if (!wanted) return;
    if (!linkableCatalogFields(fields, linkedId).some((f) => f.id === wanted)) {
      throw new ConflictError(
        `Campo '${wanted}' não pode ser vinculado a ${title}: só campo personalizado de seleção, não arquivado ("" desvincula).`
      );
    }
  };
  linkable(patch.projectStageFieldId, current.projectStageFieldId, "Project Stage");
  linkable(patch.nonBillableReasonFieldId, current.nonBillableReasonFieldId, "Non Billable reason");
  return { status: 200, body: await port.updateMonday(patch) };
};

export const getZendeskSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.integrationSettings.zendesk(),
});

export const updateZendeskSettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<ZendeskSettingsPatch>(params.body, ZENDESK_RULES, "Zendesk");
  assertConnected(deps.integrationSettings.zendesk().connected, ZENDESK_NOT_CONNECTED);
  await assertWorkspace(deps, patch.workspaceId);
  return { status: 200, body: await deps.integrationSettings.updateZendesk(patch) };
};

/** Só leitura: provedor e modelo se trocam pelo modal de conexão, que testa a chave. */
export const getLlmSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.integrationSettings.llm(),
});

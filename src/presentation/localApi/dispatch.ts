import { errorResult, toErrorResult } from "./errors";
import {
  createCategoryHandler,
  createProjectHandler,
  deleteCategoryHandler,
  deleteManyCategories,
  deleteManyProjects,
  deleteProjectHandler,
  importCategories,
  importProjects,
  listCategories,
  listProjects,
  updateCategoryHandler,
  updateProjectHandler,
} from "./handlers/catalog";
import {
  createCustomFieldHandler,
  deleteCustomFieldHandler,
  listCustomFields,
  updateCustomFieldHandler,
} from "./handlers/customFields";
import {
  completePlannedTask,
  createPlannedTaskHandler,
  deletePlannedTask,
  duplicatePlannedTaskHandler,
  getPlannedTask,
  launchPlannedTaskRetroactiveHandler,
  listPlannedTasks,
  patchPlannedTaskHandler,
  startPlannedTaskHandler,
  uncompletePlannedTask,
  updatePlannedTaskHandler,
} from "./handlers/plannedTasks";
import {
  createHistoryTask,
  deleteHistoryTask,
  getHistoryTask,
  listHistory,
  setHistoryTaskBillable,
  updateHistoryTask,
} from "./handlers/history";
import {
  deleteManyHistoryTasks,
  mergeHistoryTasks,
  moveHistoryTasks,
} from "./handlers/historyBatch";
import { getPeriodTotals, getWeekTotals } from "./handlers/totals";
import { previewIntegrationSend, sendToIntegration } from "./handlers/integrations";
import {
  createExportProfileHandler,
  deleteExportProfileHandler,
  generateExportHandler,
  listExportProfiles,
  setDefaultExportProfileHandler,
  updateExportProfileHandler,
} from "./handlers/exportProfiles";
import { importCalendarEventsHandler, previewCalendarImport } from "./handlers/calendarImport";
import { importZendeskTicketsHandler, previewZendeskImport } from "./handlers/zendeskImport";
import {
  importMondayCategoriesHandler,
  importMondayItemsHandler,
  importMondayProjectsHandler,
  previewMondayImport,
  readMondayCatalogsHandler,
} from "./handlers/mondayImport";
import { generateDaySummaries, listDaySummaries } from "./handlers/daySummaries";
import { getDriveBackupStatus, runDriveBackup } from "./handlers/driveBackup";
import { listClockifyEntries, listMondayEntries } from "./handlers/integrationEntries";
import {
  createClockifyEntry,
  deleteClockifyEntry,
  deleteMondayEntryHandler,
  updateClockifyEntry,
  updateMondayEntryHandler,
} from "./handlers/integrationEntryWrites";
import { listProjectCategories, setProjectCategories } from "./handlers/projectCategories";
import {
  getAccessibilitySettings,
  getGeneralSettings,
  getOverlaySettings,
  getShortcutSettings,
  resetWindowPositionsHandler,
  toggleOverlayHandler,
  updateAccessibilitySettings,
  updateGeneralSettings,
  updateOverlaySettings,
  updateShortcutSettings,
} from "./handlers/settings";
import {
  getCalendarSettings,
  getClockifySettings,
  getDriveBackupSettings,
  getLlmSettings,
  getMondaySettings,
  getSheetsSettings,
  getZendeskSettings,
  updateCalendarSettings,
  updateClockifySettings,
  updateDriveBackupSettings,
  updateMondaySettings,
  updateSheetsSettings,
  updateZendeskSettings,
} from "./handlers/integrationSettings";
import {
  addCalendarIgnoreRule,
  createMondayCatalogField,
  getClockifyCatalog,
  importClockifyProjects,
  importClockifyTags,
  listClockifyWorkspaces,
  refreshMondayCatalogField,
  removeCalendarIgnoreRule,
  removeClockifyProjectMapping,
  runAutoSyncNow,
  setClockifyCategoryTags,
  setClockifyDefaultTags,
  setClockifyProjectMapping,
  setMondayProjectBoard,
} from "./handlers/integrationActions";
import { applyShareHandler, previewShareHandler, shareLinkHandler } from "./handlers/share";
import {
  cancelTask,
  getStatus,
  pauseTask,
  resumeTask,
  startTask,
  stopTask,
  toggleTask,
  updateActiveTaskHandler,
} from "./handlers/tasks";
import {
  createWorkspaceHandler,
  deleteWorkspaceHandler,
  getActiveWorkspace,
  listWorkspaces,
  setActiveWorkspace,
  updateWorkspaceHandler,
} from "./handlers/workspaces";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams, LocalApiResult } from "./types";

/** As chaves são as `op` que `src-tauri/src/api/handlers.rs` e seus submódulos emitem. */
const HANDLERS: Record<string, LocalApiHandler> = {
  "status.get": getStatus,
  "tasks.start": startTask,
  "tasks.pause": pauseTask,
  "tasks.resume": resumeTask,
  "tasks.stop": stopTask,
  "tasks.toggle": toggleTask,
  "tasks.cancel": cancelTask,
  "tasks.updateActive": updateActiveTaskHandler,
  // `tasks.*` de propósito: inicia a tarefa em execução, então espera o render.
  "tasks.startPlanned": startPlannedTaskHandler,
  // Registros concluídos: `history.*` e não `tasks.*`, porque não mexem na
  // tarefa em execução e não devem esperar o render (`waitsForNextCommit`).
  "history.list": listHistory,
  "history.get": getHistoryTask,
  "history.create": createHistoryTask,
  "history.update": updateHistoryTask,
  "history.delete": deleteHistoryTask,
  "history.deleteMany": deleteManyHistoryTasks,
  "history.setBillable": setHistoryTaskBillable,
  "history.merge": mergeHistoryTasks,
  "history.move": moveHistoryTasks,
  "totals.period": getPeriodTotals,
  "totals.week": getWeekTotals,
  "workspaces.list": listWorkspaces,
  "workspaces.create": createWorkspaceHandler,
  "workspaces.update": updateWorkspaceHandler,
  "workspaces.delete": deleteWorkspaceHandler,
  "workspaces.getActive": getActiveWorkspace,
  "workspaces.setActive": setActiveWorkspace,
  "projects.list": listProjects,
  "projects.create": createProjectHandler,
  "projects.update": updateProjectHandler,
  "projects.delete": deleteProjectHandler,
  "projects.import": importProjects,
  "projects.deleteMany": deleteManyProjects,
  "projectCategories.list": listProjectCategories,
  "projectCategories.set": setProjectCategories,
  "categories.list": listCategories,
  "categories.create": createCategoryHandler,
  "categories.update": updateCategoryHandler,
  "categories.delete": deleteCategoryHandler,
  "categories.import": importCategories,
  "categories.deleteMany": deleteManyCategories,
  "customFields.list": listCustomFields,
  "customFields.create": createCustomFieldHandler,
  "customFields.update": updateCustomFieldHandler,
  "customFields.delete": deleteCustomFieldHandler,
  "plannedTasks.list": listPlannedTasks,
  "plannedTasks.get": getPlannedTask,
  "plannedTasks.create": createPlannedTaskHandler,
  "plannedTasks.update": updatePlannedTaskHandler,
  "plannedTasks.patch": patchPlannedTaskHandler,
  "plannedTasks.delete": deletePlannedTask,
  "plannedTasks.complete": completePlannedTask,
  "plannedTasks.uncomplete": uncompletePlannedTask,
  "plannedTasks.duplicate": duplicatePlannedTaskHandler,
  "plannedTasks.launchRetroactive": launchPlannedTaskRetroactiveHandler,
  // Não mexem na tarefa em execução nem no workspace: não esperam o render.
  "integrations.sendPreview": previewIntegrationSend,
  "integrations.send": sendToIntegration,
  "exportProfiles.list": listExportProfiles,
  "exportProfiles.create": createExportProfileHandler,
  "exportProfiles.update": updateExportProfileHandler,
  "exportProfiles.delete": deleteExportProfileHandler,
  "exportProfiles.setDefault": setDefaultExportProfileHandler,
  "export.generate": generateExportHandler,
  // Imports das integrações (Fase D1): prévia + import onde a tela seleciona.
  // Não mexem na tarefa em execução nem no workspace: não esperam o render.
  "calendar.importPreview": previewCalendarImport,
  "calendar.import": importCalendarEventsHandler,
  "zendesk.importPreview": previewZendeskImport,
  "zendesk.import": importZendeskTicketsHandler,
  "monday.importPreview": previewMondayImport,
  "monday.import": importMondayItemsHandler,
  "monday.importProjects": importMondayProjectsHandler,
  "monday.importCategories": importMondayCategoriesHandler,
  "monday.readCatalogs": readMondayCatalogsHandler,
  // Fase D2: lançamentos do Clockify e do Monday (leitura), resumo do dia por
  // IA e backup no Drive. Não mexem na tarefa em execução: não esperam o render.
  "clockify.entries": listClockifyEntries,
  "monday.entries": listMondayEntries,
  "daySummaries.list": listDaySummaries,
  "daySummaries.generate": generateDaySummaries,
  "driveBackup.status": getDriveBackupStatus,
  "driveBackup.run": runDriveBackup,
  // Fase D2b: escrita nos lançamentos. Gravam no Clockify e no Monday (e, na
  // exclusão do Monday, no rastreio local); não esperam o render.
  "clockify.createEntry": createClockifyEntry,
  "clockify.updateEntry": updateClockifyEntry,
  "clockify.deleteEntry": deleteClockifyEntry,
  "monday.updateEntry": updateMondayEntryHandler,
  "monday.deleteEntry": deleteMondayEntryHandler,
  // Fase D3a: configurações por grupo e o link de compartilhar tarefa. Nenhuma
  // de configuração espera o render: a ponte lê a config por função, na hora.
  "settings.getGeneral": getGeneralSettings,
  "settings.updateGeneral": updateGeneralSettings,
  "settings.getOverlay": getOverlaySettings,
  "settings.updateOverlay": updateOverlaySettings,
  "settings.getAccessibility": getAccessibilitySettings,
  "settings.updateAccessibility": updateAccessibilitySettings,
  "settings.getShortcuts": getShortcutSettings,
  "settings.updateShortcuts": updateShortcutSettings,
  "settings.resetWindowPositions": resetWindowPositionsHandler,
  "overlay.toggle": toggleOverlayHandler,
  "share.link": shareLinkHandler,
  "share.preview": previewShareHandler,
  // Inicia a tarefa em execução no modo `start`: espera o render (abaixo).
  "share.apply": applyShareHandler,
  // Fase D3b: ajustes não secretos das integrações e as ações da tela de
  // Integrações. Só gravam config, catálogo e campos (e, no "Enviar agora",
  // enviam): não mexem na tarefa em execução nem no workspace ativo, e não
  // esperam o render — a ponte lê a config na hora.
  "settings.getSheets": getSheetsSettings,
  "settings.updateSheets": updateSheetsSettings,
  "settings.getCalendar": getCalendarSettings,
  "settings.updateCalendar": updateCalendarSettings,
  "settings.getDriveBackup": getDriveBackupSettings,
  "settings.updateDriveBackup": updateDriveBackupSettings,
  "settings.getClockify": getClockifySettings,
  "settings.updateClockify": updateClockifySettings,
  "settings.getMonday": getMondaySettings,
  "settings.updateMonday": updateMondaySettings,
  "settings.getZendesk": getZendeskSettings,
  "settings.updateZendesk": updateZendeskSettings,
  "settings.getLlm": getLlmSettings,
  "calendar.addIgnoreRule": addCalendarIgnoreRule,
  "calendar.removeIgnoreRule": removeCalendarIgnoreRule,
  "clockify.workspaces": listClockifyWorkspaces,
  "clockify.catalog": getClockifyCatalog,
  "clockify.setProjectMapping": setClockifyProjectMapping,
  "clockify.removeProjectMapping": removeClockifyProjectMapping,
  "clockify.setCategoryTags": setClockifyCategoryTags,
  "clockify.setDefaultTags": setClockifyDefaultTags,
  "clockify.importProjects": importClockifyProjects,
  "clockify.importTags": importClockifyTags,
  "monday.createCatalogField": createMondayCatalogField,
  "monday.refreshCatalogField": refreshMondayCatalogField,
  "monday.setProjectBoard": setMondayProjectBoard,
  "integrations.syncNow": runAutoSyncNow,
};

/** Toda `op` da ponte — a trava de cobertura do MCP confere contra `src-tauri/mcp-ops.json`. */
export const LOCAL_API_OPS: readonly string[] = Object.keys(HANDLERS);

/** Nunca rejeita: todo erro vira status, porque o Rust aguarda uma resposta. */
export async function dispatchLocalApiRequest(
  deps: LocalApiDeps,
  op: string,
  params: LocalApiParams | null | undefined
): Promise<LocalApiResult> {
  const handler = HANDLERS[op];
  if (!handler) return errorResult(404, `Operação desconhecida: '${op}'`);
  try {
    return await handler(deps, params ?? {});
  } catch (error) {
    return toErrorResult(error);
  }
}

const CONTEXT_MUTATIONS = new Set([
  "workspaces.create",
  "workspaces.update",
  "workspaces.delete",
  "workspaces.setActive",
  // "Iniciar agora" do link recebido troca a tarefa em execução. No modo
  // `plan` a espera só custa o teto de `COMMIT_WAIT_MS`.
  "share.apply",
]);

/**
 * Ops que mudam o que o retrato lê de contexto — a tarefa em execução, o
 * workspace ativo ou a lista de workspaces. A próxima requisição precisa
 * esperar o render.
 */
export function waitsForNextCommit(op: string): boolean {
  return op.startsWith("tasks.") || CONTEXT_MUTATIONS.has(op);
}

/**
 * As `LONG_OPS` do `bridge.rs`: levam até minutos (provedor de IA, upload ao
 * Drive). Na fila principal, quem chegasse atrás delas estouraria o prazo de
 * 10 s do Rust e **ainda assim executaria** depois — um `tasks.start` daria 504
 * e iniciaria a tarefa, e o retry a iniciaria de novo. Rodam numa fila própria:
 * não leem nem mudam o que o retrato tira de contexto, como na tela, onde o
 * botão de backup e a aba de resumo correm junto com o resto.
 */
const LONG_OPS = new Set(["daySummaries.generate", "driveBackup.run"]);

export function runsInLongQueue(op: string): boolean {
  return LONG_OPS.has(op);
}

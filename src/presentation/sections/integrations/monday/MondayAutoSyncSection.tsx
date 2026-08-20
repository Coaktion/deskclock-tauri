import { MONDAY_INTEGRATION_NAME } from "@presentation/contexts/AutoSyncContext";
import { AutoSyncControls, type AutoSyncNow } from "../AutoSyncControls";
import { MONDAY_AUTO_SYNC_KEYS } from "../autoSyncIntegrations";

/** O envio ao Monday é um upsert por grupo: o count são atividades, não tarefas. */
const MONDAY_SYNC_NOW: AutoSyncNow = {
  integrationName: MONDAY_INTEGRATION_NAME,
  successMessage: (count) => `${count} atividade(s) enviada(s) ao Monday.`,
};

export function MondayAutoSyncSection() {
  return <AutoSyncControls keys={MONDAY_AUTO_SYNC_KEYS} syncNow={MONDAY_SYNC_NOW} />;
}

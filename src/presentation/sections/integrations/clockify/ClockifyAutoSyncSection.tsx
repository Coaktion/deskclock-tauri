import { AutoSyncControls } from "../AutoSyncControls";
import { CLOCKIFY_AUTO_SYNC_KEYS } from "../autoSyncIntegrations";

export function ClockifyAutoSyncSection() {
  return <AutoSyncControls keys={CLOCKIFY_AUTO_SYNC_KEYS} />;
}

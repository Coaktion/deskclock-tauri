import { AutoSyncControls, type AutoSyncConfigKeys } from "../AutoSyncControls";

const MONDAY_KEYS: AutoSyncConfigKeys = {
  enabled: "mondayAutoSync",
  mode: "mondayAutoSyncMode",
  trigger: "mondayAutoSyncTrigger",
  time: "mondayAutoSyncTime",
  lastSync: "mondayDailySyncLastTimestamp",
};

export function MondayAutoSyncSection() {
  return <AutoSyncControls keys={MONDAY_KEYS} />;
}

import { AutoSyncControls, type AutoSyncConfigKeys } from "../AutoSyncControls";

const CLOCKIFY_KEYS: AutoSyncConfigKeys = {
  enabled: "clockifyAutoSync",
  mode: "clockifyAutoSyncMode",
  trigger: "clockifyAutoSyncTrigger",
  time: "clockifyAutoSyncTime",
  lastSync: "clockifyDailySyncLastTimestamp",
};

export function ClockifyAutoSyncSection() {
  return <AutoSyncControls keys={CLOCKIFY_KEYS} />;
}

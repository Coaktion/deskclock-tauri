import { useEffect } from "react";
import { showToast } from "@shared/utils/toast";
import { todayISO, addDaysISO } from "@shared/utils/time";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { useAutoSync } from "@presentation/contexts/AutoSyncContext";

type RunDaily = ReturnType<typeof useAutoSync>["runDaily"];

export function useDailySyncScheduler(config: ConfigContextValue, runDaily: RunDaily) {
  useEffect(() => {
    if (!config.isLoaded) return;

    const sheetsDaily =
      config.get("integrationGoogleSheetsAutoSync") && config.get("sheetsAutoSyncMode") === "daily";
    const clockifyDaily =
      config.get("clockifyAutoSync") && config.get("clockifyAutoSyncMode") === "daily";

    if (!sheetsDaily && !clockifyDaily) return;

    async function triggerSync(endDateISO: string) {
      const results = await runDaily(endDateISO);
      const totalCount = results.reduce((s, r) => s + r.count, 0);
      const errors = results.filter((r) => r.error);
      const warnings = results.flatMap((r) => (r.warning ? [r.warning] : []));

      if (errors.length > 0) {
        for (const e of errors) await showToast("error", e.error!.message);
        return;
      }

      if (totalCount > 0 && warnings.length === 0) {
        await showToast("success", `${totalCount} tarefa(s) enviada(s) automaticamente`);
      } else if (totalCount > 0 && warnings.length > 0) {
        await showToast("warning", `${totalCount} tarefa(s) enviada(s). ${warnings.join(" ")}`);
      } else if (warnings.length > 0) {
        for (const w of warnings) await showToast("warning", w);
      }
    }

    // Sheets define o ritmo se ambas as integrações estiverem ativas
    const sheetsTrigger = config.get("sheetsAutoSyncTrigger");
    const clockifyTrigger = config.get("clockifyAutoSyncTrigger");
    const trigger = sheetsDaily ? sheetsTrigger : clockifyTrigger;

    if (trigger === "on-open") {
      void triggerSync(addDaysISO(todayISO(), -1));
      return;
    }

    if (trigger === "fixed-time") {
      const timeStr = sheetsDaily
        ? config.get("sheetsAutoSyncTime")
        : config.get("clockifyAutoSyncTime");
      const [hh, mm] = timeStr.split(":").map(Number);
      let fired = false;

      const interval = setInterval(() => {
        if (fired) return;
        const now = new Date();
        if (now.getHours() === hh && now.getMinutes() === mm) {
          fired = true;
          void triggerSync(todayISO());
        }
      }, 30_000);

      return () => clearInterval(interval);
    }
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}

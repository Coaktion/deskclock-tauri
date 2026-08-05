import { useEffect, useRef } from "react";
import { showToast } from "@shared/utils/toast";
import { todayISO } from "@shared/utils/time";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { useAutoSync } from "@presentation/contexts/AutoSyncContext";

type RunDaily = ReturnType<typeof useAutoSync>["runDaily"];

const POLL_INTERVAL_MS = 30_000;

function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function nowMinutesLocal(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function useDailySyncScheduler(config: ConfigContextValue, runDaily: RunDaily) {
  const onOpenFiredRef = useRef(false);

  useEffect(() => {
    if (!config.isLoaded) return;

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
        await showToast(
          "warning",
          `${totalCount} tarefa(s) enviada(s). ${warnings.join(" ")}`,
          6000
        );
      } else if (warnings.length > 0) {
        for (const w of warnings) await showToast("warning", w, 6000);
      }
    }

    async function checkAndFire() {
      const sheetsDaily =
        config.get("integrationGoogleSheetsAutoSync") &&
        config.get("sheetsAutoSyncMode") === "daily";
      const clockifyDaily =
        config.get("clockifyAutoSync") && config.get("clockifyAutoSyncMode") === "daily";
      if (!sheetsDaily && !clockifyDaily) return;

      const sheetsTrigger = config.get("sheetsAutoSyncTrigger");
      const clockifyTrigger = config.get("clockifyAutoSyncTrigger");

      const sheetsOnOpen = sheetsDaily && sheetsTrigger === "on-open";
      const clockifyOnOpen = clockifyDaily && clockifyTrigger === "on-open";
      const sheetsFixed = sheetsDaily && sheetsTrigger === "fixed-time";
      const clockifyFixed = clockifyDaily && clockifyTrigger === "fixed-time";

      const today = todayISO();
      const nowMins = nowMinutesLocal();

      // on-open: dispara uma vez por sessão do app
      const onOpenDue = !onOpenFiredRef.current && (sheetsOnOpen || clockifyOnOpen);
      if (onOpenDue) {
        onOpenFiredRef.current = true;
      }

      // fixed-time: dispara apenas quando o minuto atual coincide com o configurado.
      // Se o app estava fechado nesse minuto, não dispara depois — evita comportamento
      // "oculto" em que o usuário não vê quando a sync rodou.
      // A chave de "já disparou" inclui o horário configurado para que, se o usuário
      // alterar o horário no mesmo dia, a sync possa disparar novamente.
      const sheetsTime = config.get("sheetsAutoSyncTime");
      const clockifyTime = config.get("clockifyAutoSyncTime");
      const sheetsKey = `${today}@${sheetsTime}`;
      const clockifyKey = `${today}@${clockifyTime}`;
      const sheetsFixedDue =
        sheetsFixed &&
        config.get("sheetsAutoSyncLastFiredDate") !== sheetsKey &&
        nowMins === parseTimeToMinutes(sheetsTime);
      const clockifyFixedDue =
        clockifyFixed &&
        config.get("clockifyAutoSyncLastFiredDate") !== clockifyKey &&
        nowMins === parseTimeToMinutes(clockifyTime);

      if (!onOpenDue && !sheetsFixedDue && !clockifyFixedDue) return;

      // Marca as flags ANTES de disparar para evitar dupla execução em polls concorrentes
      if (sheetsFixedDue) await config.set("sheetsAutoSyncLastFiredDate", sheetsKey);
      if (clockifyFixedDue) await config.set("clockifyAutoSyncLastFiredDate", clockifyKey);

      await triggerSync(today);
    }

    void checkAndFire();
    const interval = setInterval(() => void checkAndFire(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}

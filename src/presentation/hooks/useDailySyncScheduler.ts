import { useEffect, useRef } from "react";
import { showToast } from "@shared/utils/toast";
import { todayISO } from "@shared/utils/time";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { useAutoSync } from "@presentation/contexts/AutoSyncContext";
import {
  AUTO_SYNC_INTEGRATIONS,
  type AutoSyncConfigKeys,
} from "@presentation/sections/integrations/autoSyncIntegrations";

type AutoSync = ReturnType<typeof useAutoSync>;

const POLL_INTERVAL_MS = 30_000;

interface DueIntegration {
  integrationName: string;
  /** Ausente no gatilho `on-open`, que se controla pela sessão e não pela config. */
  lastFired?: { key: AutoSyncConfigKeys["lastFired"]; value: string };
}

function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function nowMinutesLocal(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Dispara o envio diário de cada integração no **gatilho dela**.
 *
 * O disparo é por integração (`runDailyFor`), não o `runDaily` que roda todas as
 * habilitadas: com o disparo global, o gatilho que vencia arrastava junto as
 * outras integrações — o Clockify marcado para as 18h subia às 9h porque o
 * Sheets estava em "ao abrir o app" —, e a integração cujo gatilho nunca era
 * consultado só subia de carona. Era o caso do Monday, que o agendador não
 * conhecia.
 */
export function useDailySyncScheduler(config: ConfigContextValue, autoSync: AutoSync) {
  const onOpenFiredRef = useRef(new Set<string>());

  useEffect(() => {
    if (!config.isLoaded) return;

    async function reportResults(results: AutoSyncResult[]) {
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

    /**
     * `on-open` dispara uma vez por sessão do app, **por integração**.
     *
     * `fixed-time` dispara apenas quando o minuto atual coincide com o
     * configurado: se o app estava fechado nesse minuto, não dispara depois —
     * evita comportamento "oculto" em que o usuário não vê quando o envio
     * rodou. A marca de "já disparou" inclui o horário configurado, para que
     * trocar o horário no mesmo dia permita um novo disparo.
     */
    function collectDue(today: string, nowMins: number): DueIntegration[] {
      const due: DueIntegration[] = [];

      for (const { integrationName, keys } of AUTO_SYNC_INTEGRATIONS) {
        if (!autoSync.isDailyEnabled(integrationName)) continue;

        if (config.get(keys.trigger) === "on-open") {
          if (onOpenFiredRef.current.has(integrationName)) continue;
          onOpenFiredRef.current.add(integrationName);
          due.push({ integrationName });
          continue;
        }

        const time = config.get(keys.time);
        const firedValue = `${today}@${time}`;
        if (config.get(keys.lastFired) === firedValue) continue;
        if (nowMins !== parseTimeToMinutes(time)) continue;
        due.push({ integrationName, lastFired: { key: keys.lastFired, value: firedValue } });
      }

      return due;
    }

    async function checkAndFire() {
      const today = todayISO();
      const due = collectDue(today, nowMinutesLocal());

      if (due.length === 0) return;

      // Marca as flags ANTES de disparar para evitar dupla execução em polls
      // concorrentes — o envio ao destino é lento e o poll não espera.
      for (const { lastFired } of due) {
        if (lastFired) await config.set(lastFired.key, lastFired.value);
      }

      const results = await Promise.all(
        due.map((d) => autoSync.runDailyFor(d.integrationName, today))
      );
      await reportResults(results.filter((r): r is AutoSyncResult => r !== null));
    }

    void checkAndFire();
    const interval = setInterval(() => void checkAndFire(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { todayISO } from "@shared/utils/time";

/**
 * Conjunto de títulos (lowercase/trim) de reuniões que o rastreamento automático
 * está acompanhando HOJE e que ainda vão notificar (não encerradas). Usado para
 * exibir um indicador nas tarefas planejadas correspondentes.
 *
 * Rastreamento só existe para o dia atual, então o indicador só é relevante para
 * a data de hoje — os consumidores devem comparar `dateISO === today`.
 */
export function useTrackedMeetingTitles(): { titles: Set<string>; today: string } {
  const { trackedMeetingRepo } = useRepositories();
  const [titles, setTitles] = useState<Set<string>>(new Set());
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    async function load() {
      const meetings = await trackedMeetingRepo.listForDate(todayISO()).catch(() => []);
      if (!alive) return;
      setTitles(new Set(meetings.filter((m) => !m.ended).map((m) => m.title.toLowerCase().trim())));
    }
    void load();
    // Re-lê quando o rastreamento pode ter mudado: import de eventos (novas
    // reuniões) e mudanças na tarefa em execução (uma reunião pode ter encerrado).
    const unlistenPlanned = listen(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, () => void load());
    const unlistenRunning = listen(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, () => void load());
    return () => {
      alive = false;
      unlistenPlanned.then((fn) => fn());
      unlistenRunning.then((fn) => fn());
    };
  }, [trackedMeetingRepo]);

  return { titles, today };
}

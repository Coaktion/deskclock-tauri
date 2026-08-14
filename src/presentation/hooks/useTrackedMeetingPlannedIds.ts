import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { todayISO } from "@shared/utils/time";
import type { UUID } from "@shared/types";

/**
 * Ids das PlannedTasks que o rastreamento automático está acompanhando HOJE e
 * que ainda vão notificar (não encerradas). Usado para exibir um indicador na
 * linha da planejada correspondente.
 *
 * **O vínculo é o `plannedTaskId`, nunca o nome.** Enquanto foi por nome, o
 * indicador quebrava nos dois sentidos: renomear a planejada apagava o sino de
 * uma reunião que continuava rastreada, e duas planejadas homônimas acendiam as
 * duas. A coluna existe desde a migration 014, e o próprio comentário dela
 * descreve essa classe de quebra como o motivo de ter sido criada — o
 * `syncTodayMeetings` a grava tanto ao criar a planejada quanto ao adotar uma
 * que já existia (inclusive vinda do Monday).
 *
 * Rastreamento só existe para o dia atual, então o indicador só é relevante para
 * a data de hoje — os consumidores devem comparar `dateISO === today`.
 */
export function useTrackedMeetingPlannedIds(): { plannedIds: Set<UUID>; today: string } {
  const { trackedMeetingRepo } = useRepositories();
  const [plannedIds, setPlannedIds] = useState<Set<UUID>>(new Set());
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    async function load() {
      const meetings = await trackedMeetingRepo.listForDate(todayISO()).catch(() => []);
      if (!alive) return;
      setPlannedIds(
        new Set(
          meetings.filter((m) => !m.ended && m.plannedTaskId).map((m) => m.plannedTaskId as UUID)
        )
      );
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

  return { plannedIds, today };
}

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { actionsOf } from "@domain/utils/plannedActions";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

const NO_ACTIONS = actionsOf(null);

/**
 * As ações da planejada de uma única tarefa, para a superfície que não carrega
 * a lista de planejadas (o chip da barra de título). Quem já tem a lista usa o
 * `actionsOfPlanned` direto, sem uma consulta por linha.
 */
export function usePlannedTaskActions(plannedTaskId: string | null): PlannedTaskAction[] {
  const { plannedTaskRepo } = useRepositories();
  const [loaded, setLoaded] = useState<{ id: string; actions: PlannedTaskAction[] } | null>(null);

  // A resposta carrega o id que a pediu: a consulta de um id antigo que chega
  // depois da do novo não pode sobrescrevê-la. Os descartes vêm do `cancelled`
  // do efeito; o id guardado cobre o intervalo em que o estado ainda é do anterior.
  const load = useCallback(
    async (id: string, isCancelled: () => boolean) => {
      let actions: PlannedTaskAction[];
      try {
        actions = actionsOf(await plannedTaskRepo.findById(id));
      } catch {
        actions = NO_ACTIONS;
      }
      if (!isCancelled()) setLoaded({ id, actions });
    },
    [plannedTaskRepo]
  );

  useEffect(() => {
    if (!plannedTaskId) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    void load(plannedTaskId, isCancelled);
    // As ações podem ser editadas em outra janela. Com StrictMode o ouvinte pode
    // sobreviver ao unlisten e disparar duas vezes — inofensivo, porque só relê.
    const unlisten = listen(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, () => {
      void load(plannedTaskId, isCancelled);
    });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [plannedTaskId, load]);

  if (!plannedTaskId || loaded?.id !== plannedTaskId) return NO_ACTIONS;
  return loaded.actions;
}

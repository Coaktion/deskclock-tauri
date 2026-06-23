import { emit } from "@tauri-apps/api/event";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

/**
 * Notifica todas as janelas de que registros de tarefa (concluídas/retroativas)
 * mudaram — criação, edição, exclusão, unificação ou alternância de billable.
 * Listas de tarefas (janela principal, histórico e aba "Executadas" do popup)
 * escutam OVERLAY_EVENTS.TASKS_CHANGED para recarregar, mantendo o estado uniforme.
 *
 * Espelha o padrão de OVERLAY_EVENTS.PLANNED_TASKS_CHANGED para tarefas planejadas.
 */
export function notifyTasksChanged(): Promise<void> {
  return emit(OVERLAY_EVENTS.TASKS_CHANGED, {});
}

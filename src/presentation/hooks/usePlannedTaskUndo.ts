import { deletePlannedTasks } from "@domain/usecases/plannedTasks/DeletePlannedTasks";
import { restorePlannedTasks } from "@domain/usecases/plannedTasks/RestorePlannedTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useUndoableDelete } from "@presentation/hooks/useUndoableDelete";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

function deletedMessage(count: number): string {
  return count === 1 ? "Tarefa excluída" : `${count} tarefas excluídas`;
}

/**
 * Exclusão de planejadas com desfazer — a configuração do `useUndoableDelete`.
 *
 * `onChanged` recarrega a tela e avisa as outras janelas — é o
 * `syncAfterMutation` do `usePlannedTasks*`, injetado para o desfazer seguir o
 * mesmo caminho das outras mutações.
 */
export function usePlannedTaskUndo(onChanged: () => Promise<void> | void) {
  const { plannedTaskRepo } = useRepositories();
  return useUndoableDelete({
    remove: (ids) => deletePlannedTasks(plannedTaskRepo, ids),
    restore: (snapshots) => restorePlannedTasks(plannedTaskRepo, snapshots),
    deletedMessage,
    undoEvent: OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE,
    onChanged,
  });
}

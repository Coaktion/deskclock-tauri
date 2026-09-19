import { deleteTasks } from "@domain/usecases/tasks/DeleteTasks";
import { restoreTasks } from "@domain/usecases/tasks/RestoreTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useUndoableDelete } from "@presentation/hooks/useUndoableDelete";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { notifyTasksChanged } from "@shared/utils/taskSync";

function deletedMessage(count: number): string {
  return count === 1 ? "Lançamento excluído" : `${count} lançamentos excluídos`;
}

/**
 * Exclusão de lançamentos (`Task`) com desfazer — a configuração do
 * `useUndoableDelete`. É a única porta da UI para apagar lançamento; a API local
 * e o MCP apagam pelo `deleteTask`, sem desfazer.
 *
 * O aviso às outras janelas (`TASKS_CHANGED`) mora aqui, e não em quem chama:
 * apagar e restaurar precisam emiti-lo, e esquecê-lo numa das três telas
 * deixaria o popup e as outras listas mostrando o que não existe mais.
 * `reload` só recarrega a própria tela.
 */
export function useTaskUndo(reload: () => Promise<void> | void) {
  const { taskRepo } = useRepositories();
  return useUndoableDelete({
    remove: (ids) => deleteTasks(taskRepo, ids),
    restore: (snapshots) => restoreTasks(taskRepo, snapshots),
    deletedMessage,
    undoEvent: OVERLAY_EVENTS.TASKS_UNDO_DELETE,
    onChanged: async () => {
      void notifyTasksChanged();
      await reload();
    },
  });
}

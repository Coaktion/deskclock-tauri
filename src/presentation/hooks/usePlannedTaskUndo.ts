import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { deletePlannedTasks } from "@domain/usecases/plannedTasks/DeletePlannedTasks";
import { restorePlannedTasks } from "@domain/usecases/plannedTasks/RestorePlannedTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { showToast } from "@shared/utils/toast";
import type { UUID } from "@shared/types";

export const UNDO_WINDOW_MS = 6000;

function deletedMessage(count: number): string {
  return count === 1 ? "Tarefa excluída" : `${count} tarefas excluídas`;
}

// Ali o Ctrl+Z desfaz texto, não a exclusão.
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return (
    target.isContentEditable || !!target.closest('[contenteditable]:not([contenteditable="false"])')
  );
}

function isUndoShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z";
}

/**
 * Exclusão de planejadas com desfazer (spec `acoes-da-linha-planejada.md`): só o
 * último lote, por 6 s, pelo botão do toast ou pelo Ctrl+Z.
 *
 * `onChanged` recarrega a tela e avisa as outras janelas — é o
 * `syncAfterMutation` do `usePlannedTasks*`, injetado para o desfazer seguir o
 * mesmo caminho das outras mutações.
 */
export function usePlannedTaskUndo(onChanged: () => Promise<void> | void) {
  const { plannedTaskRepo } = useRepositories();
  const pendingRef = useRef<PlannedTask[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Em ref para `undo` ficar estável: o `onChanged` muda a cada troca de
  // semana, e cada mudança refaria o `listen` — justamente a janela em que o
  // StrictMode deixa ouvinte duplicado.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const undo = useCallback(async () => {
    const snapshots = pendingRef.current;
    if (!snapshots) return;
    // Limpa antes do await: a segunda entrega do mesmo evento chega enquanto o
    // restauro ainda roda e precisa encontrar nada pendente.
    clearPending();
    try {
      await restorePlannedTasks(plannedTaskRepo, snapshots);
    } catch {
      void showToast("error", "Não foi possível desfazer.");
    }
    await onChangedRef.current();
  }, [plannedTaskRepo, clearPending]);

  const removeWithUndo = useCallback(
    async (ids: UUID[]) => {
      let snapshots: PlannedTask[];
      try {
        snapshots = await deletePlannedTasks(plannedTaskRepo, ids);
      } catch {
        // O lote não é atômico: o que foi apagado antes da falha fica apagado e
        // sem desfazer, porque os snapshots não chegam aqui. Recarregar mostra
        // o que de fato sobrou.
        void showToast("error", "Não foi possível excluir.");
        await onChangedRef.current();
        return;
      }
      await onChangedRef.current();
      // Nada apagado (outra janela chegou antes): o lote anterior continua
      // valendo, como o toast dele, que segue na tela.
      if (snapshots.length === 0) return;

      clearPending();
      pendingRef.current = snapshots;
      timerRef.current = setTimeout(clearPending, UNDO_WINDOW_MS);
      void showToast(
        "success",
        deletedMessage(snapshots.length),
        UNDO_WINDOW_MS,
        "Desfazer",
        OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE
      );
    },
    [plannedTaskRepo, clearPending]
  );

  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE, () => void undo());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [undo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || !isUndoShortcut(e) || !pendingRef.current) return;
      if (isEditableTarget(e.target) || document.querySelector("[data-modal-open]")) return;
      e.preventDefault();
      void undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  useEffect(() => clearPending, [clearPending]);

  return { removeWithUndo };
}

import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { showToast } from "@shared/utils/toast";
import type { UUID } from "@shared/types";

export const UNDO_WINDOW_MS = 6000;

export interface UndoableDeleteOptions<T> {
  /** Apaga e devolve os snapshots do que de fato apagou (id inexistente fica de fora). */
  remove: (ids: UUID[]) => Promise<T[]>;
  /** Reinsere os snapshots; precisa ser idempotente (ver `undo`). */
  restore: (snapshots: T[]) => Promise<unknown>;
  /** Texto do toast pela quantidade apagada — singular e plural. */
  deletedMessage: (count: number) => string;
  /** Evento que o botão "Desfazer" do toast emite, de outra janela. */
  undoEvent: string;
  /** Recarrega a tela e avisa as outras janelas, depois de apagar e de restaurar. */
  onChanged: () => Promise<void> | void;
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
 * Exclusão com desfazer (spec `acoes-da-linha-planejada.md`): só o último lote,
 * por 6 s, pelo botão do toast ou pelo Ctrl+Z. Genérico desde a segunda
 * ocorrência (planejadas e lançamentos) — quem configura diz o que apagar, como
 * restaurar, o texto e o evento.
 *
 * Cada instância guarda só o lote que **ela** apagou. Duas janelas podem montar
 * a mesma configuração e ouvir o mesmo evento; a que não apagou nada o ignora.
 */
export function useUndoableDelete<T>(options: UndoableDeleteOptions<T>) {
  const { undoEvent } = options;
  const pendingRef = useRef<T[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Em ref para `undo` ficar estável: quem configura passa funções novas a cada
  // render (e o `onChanged` muda a cada troca de filtro ou semana), e cada
  // mudança refaria o `listen` — justamente a janela em que o StrictMode deixa
  // ouvinte duplicado.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

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
      await optionsRef.current.restore(snapshots);
    } catch {
      void showToast("error", "Não foi possível desfazer.");
    }
    await optionsRef.current.onChanged();
  }, [clearPending]);

  const removeWithUndo = useCallback(
    async (ids: UUID[]) => {
      const { remove, onChanged, deletedMessage } = optionsRef.current;
      let snapshots: T[];
      try {
        snapshots = await remove(ids);
      } catch {
        // O lote não é atômico: o que foi apagado antes da falha fica apagado e
        // sem desfazer, porque os snapshots não chegam aqui. Recarregar mostra
        // o que de fato sobrou.
        void showToast("error", "Não foi possível excluir.");
        await onChanged();
        return;
      }
      await onChanged();
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
        undoEvent
      );
    },
    [clearPending, undoEvent]
  );

  useEffect(() => {
    const unlisten = listen(undoEvent, () => void undo());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [undoEvent, undo]);

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

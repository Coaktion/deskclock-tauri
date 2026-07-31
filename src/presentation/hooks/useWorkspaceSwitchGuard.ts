import { useCallback, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Workspace } from "@domain/entities/Workspace";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";

interface GuardInput {
  runningTask: Task | null;
  stopTask: (completed: boolean) => Promise<void>;
}

/**
 * Troca de workspace com a guarda de tarefa em execução.
 *
 * Trocar com o timer rodando esconderia a tarefa da tela sem pará-la, então a
 * troca fica pendente até o usuário decidir se a tarefa foi concluída ou ficou
 * pendente — reusando a mesma pergunta do fluxo de parada (§5.1.2).
 *
 * `stopTask` entra por parâmetro em vez de vir do `RunningTaskContext` porque as
 * janelas de overlay recebem essa ação por prop; o hook serve as duas.
 *
 * A guarda vive aqui, e não dentro de `switchTo`, porque o `RunningTaskContext`
 * já consome o `WorkspaceContext` para saber onde criar a tarefa — o caminho
 * inverso fecharia um ciclo entre os dois providers.
 */
export function useWorkspaceSwitchGuard({ runningTask, stopTask }: GuardInput) {
  const { workspaces, activeWorkspaceId, switchTo } = useWorkspaces();
  const [pendingId, setPendingId] = useState<string | null>(null);

  /** Devolve `true` se a troca aconteceu na hora; `false` se ficou pendente. */
  const request = useCallback(
    async (id: string): Promise<boolean> => {
      if (id === activeWorkspaceId) return true;
      if (runningTask) {
        setPendingId(id);
        return false;
      }
      await switchTo(id);
      return true;
    },
    [activeWorkspaceId, runningTask, switchTo]
  );

  const confirm = useCallback(
    async (completed: boolean) => {
      const id = pendingId;
      if (!id) return;
      setPendingId(null);
      await stopTask(completed);
      await switchTo(id);
    },
    [pendingId, stopTask, switchTo]
  );

  const cancel = useCallback(() => setPendingId(null), []);

  const pending: Workspace | null = workspaces.find((w) => w.id === pendingId) ?? null;

  return { pending, request, confirm, cancel };
}

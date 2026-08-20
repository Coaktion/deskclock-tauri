import { useCallback } from "react";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { createWorkspace } from "@domain/usecases/workspaces/CreateWorkspace";
import { updateWorkspace } from "@domain/usecases/workspaces/UpdateWorkspace";
import {
  deleteWorkspace,
  type WorkspaceDeletionTarget,
} from "@domain/usecases/workspaces/DeleteWorkspace";
import type { UUID } from "@shared/types";
import { OVERLAY_EVENTS, type WorkspaceChangedPayload } from "@shared/types/overlayEvents";
import { emit } from "@tauri-apps/api/event";

/**
 * CRUD de workspaces. Separado do `WorkspaceContext`, que só carrega a lista e
 * guarda o ativo — a tela de Dados é a única que escreve.
 */
export function useWorkspaceAdmin() {
  const { workspaceRepo, workspaceDataPort } = useRepositories();
  const { workspaces, activeWorkspaceId, reload, switchTo } = useWorkspaces();

  /** Avisa as outras janelas para recarregarem a lista (nome, cor, exclusão). */
  const broadcast = useCallback(async (activeId: string) => {
    await emit(OVERLAY_EVENTS.WORKSPACE_CHANGED, {
      activeWorkspaceId: activeId,
    } satisfies WorkspaceChangedPayload);
  }, []);

  const create = useCallback(
    async (name: string, color?: string) => {
      const created = await createWorkspace(workspaceRepo, name, color);
      await reload();
      await broadcast(activeWorkspaceId);
      return created;
    },
    [workspaceRepo, reload, broadcast, activeWorkspaceId]
  );

  const update = useCallback(
    async (id: UUID, name: string, color?: string) => {
      await updateWorkspace(workspaceRepo, id, name, color);
      await reload();
      await broadcast(activeWorkspaceId);
    },
    [workspaceRepo, reload, broadcast, activeWorkspaceId]
  );

  const remove = useCallback(
    async (id: UUID, target: WorkspaceDeletionTarget) => {
      await deleteWorkspace(workspaceRepo, workspaceDataPort, id, target);
      const rest = await reload();
      // Excluir o workspace ativo deixaria a UI apontando para um id inexistente.
      if (id === activeWorkspaceId) {
        const fallback = target.mode === "move" ? target.toWorkspaceId : rest[0]?.id;
        // `switchTo` já emite o evento; sem troca, avisa mesmo assim para que as
        // outras janelas derrubem o workspace excluído da lista.
        if (fallback) await switchTo(fallback);
        else await broadcast(activeWorkspaceId);
      } else {
        await broadcast(activeWorkspaceId);
      }
    },
    [workspaceRepo, workspaceDataPort, reload, activeWorkspaceId, switchTo, broadcast]
  );

  return { workspaces, activeWorkspaceId, create, update, remove };
}

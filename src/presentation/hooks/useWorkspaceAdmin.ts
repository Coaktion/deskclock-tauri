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

/**
 * CRUD de workspaces. Separado do `WorkspaceContext`, que só carrega a lista e
 * guarda o ativo — a tela de Dados é a única que escreve.
 */
export function useWorkspaceAdmin() {
  const { workspaceRepo, workspaceDataPort } = useRepositories();
  const { workspaces, activeWorkspaceId, reload, switchTo } = useWorkspaces();

  const create = useCallback(
    async (name: string, color?: string) => {
      const created = await createWorkspace(workspaceRepo, name, color);
      await reload();
      return created;
    },
    [workspaceRepo, reload]
  );

  const update = useCallback(
    async (id: UUID, name: string, color?: string) => {
      await updateWorkspace(workspaceRepo, id, name, color);
      await reload();
    },
    [workspaceRepo, reload]
  );

  const remove = useCallback(
    async (id: UUID, target: WorkspaceDeletionTarget) => {
      await deleteWorkspace(workspaceRepo, workspaceDataPort, id, target);
      const rest = await reload();
      // Excluir o workspace ativo deixaria a UI apontando para um id inexistente.
      if (id === activeWorkspaceId) {
        const fallback = target.mode === "move" ? target.toWorkspaceId : rest[0]?.id;
        if (fallback) await switchTo(fallback);
      }
    },
    [workspaceRepo, workspaceDataPort, reload, activeWorkspaceId, switchTo]
  );

  return { workspaces, activeWorkspaceId, create, update, remove };
}

import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { IWorkspaceDataPort } from "@domain/repositories/IWorkspaceDataPort";
import type { UUID } from "@shared/types";
import { DomainError } from "@shared/errors";

/**
 * Destino dos dados do workspace excluído. Não há default: a escolha é
 * obrigatória, e é por isso que a exclusão de workspace é a exceção deliberada
 * à regra de "exclusões sem confirmação" (§1 do CLAUDE.md) — apagar meses de
 * horas registradas é irreversível demais para um clique só.
 */
export type WorkspaceDeletionTarget = { mode: "move"; toWorkspaceId: UUID } | { mode: "delete" };

export async function deleteWorkspace(
  repository: IWorkspaceRepository,
  dataPort: IWorkspaceDataPort,
  id: UUID,
  target: WorkspaceDeletionTarget
): Promise<void> {
  const workspace = await repository.findById(id);
  if (!workspace) throw new DomainError("Workspace não encontrado.");

  const all = await repository.findAll();
  if (all.length <= 1) {
    throw new DomainError("Não é possível excluir o último workspace.");
  }

  if (target.mode === "move") {
    if (target.toWorkspaceId === id) {
      throw new DomainError("O destino não pode ser o próprio workspace excluído.");
    }
    const destination = await repository.findById(target.toWorkspaceId);
    if (!destination) throw new DomainError("Workspace de destino não encontrado.");
    await dataPort.moveAll(id, target.toWorkspaceId);
  } else {
    await dataPort.deleteAll(id);
  }

  await repository.delete(id);
}

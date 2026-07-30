import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { UUID } from "@shared/types";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { workspaceColorFor } from "@domain/utils/workspaceColor";

export async function updateWorkspace(
  repository: IWorkspaceRepository,
  id: UUID,
  name: string,
  color?: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("O nome do workspace não pode ser vazio.");

  const existing = await repository.findByName(trimmed);
  if (existing && existing.id !== id) {
    throw new DuplicateNameError(`Workspace "${trimmed}" já existe.`);
  }

  await repository.update(id, trimmed, color ?? workspaceColorFor(trimmed));
}

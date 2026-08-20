import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { Workspace } from "@domain/entities/Workspace";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { workspaceColorFor } from "@domain/utils/workspaceColor";
import { generateUUID } from "@shared/utils/uuid";

export async function createWorkspace(
  repository: IWorkspaceRepository,
  name: string,
  color?: string
): Promise<Workspace> {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("O nome do workspace não pode ser vazio.");

  const existing = await repository.findByName(trimmed);
  if (existing) throw new DuplicateNameError(`Workspace "${trimmed}" já existe.`);

  const workspace: Workspace = {
    id: generateUUID(),
    name: trimmed,
    color: color ?? workspaceColorFor(trimmed),
    createdAt: new Date().toISOString(),
  };
  await repository.save(workspace);
  return workspace;
}

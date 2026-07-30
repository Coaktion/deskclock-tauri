import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { Workspace } from "@domain/entities/Workspace";

export async function getWorkspaces(repository: IWorkspaceRepository): Promise<Workspace[]> {
  return repository.findAll();
}

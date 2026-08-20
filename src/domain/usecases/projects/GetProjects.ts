import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";

import type { UUID } from "@shared/types";

/** `workspaceId` omitido devolve os projetos de todos os workspaces. */
export async function getProjects(
  repository: IProjectRepository,
  workspaceId?: UUID
): Promise<Project[]> {
  return repository.findAll(workspaceId);
}

import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";

export async function getProjects(repository: IProjectRepository): Promise<Project[]> {
  return repository.findAll();
}

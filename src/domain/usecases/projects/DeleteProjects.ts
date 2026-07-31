import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { UUID } from "@shared/types";

export async function deleteProjects(repository: IProjectRepository, ids: UUID[]): Promise<void> {
  if (ids.length === 0) return;
  await repository.deleteMany(ids);
}

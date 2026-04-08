import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { UUID } from "@shared/types";

export async function deleteProject(
  repository: IProjectRepository,
  id: UUID
): Promise<void> {
  await repository.delete(id);
}

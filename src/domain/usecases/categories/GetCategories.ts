import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Category } from "@domain/entities/Category";

import type { UUID } from "@shared/types";

/** `workspaceId` omitido devolve as categorias de todos os workspaces. */
export async function getCategories(
  repository: ICategoryRepository,
  workspaceId?: UUID
): Promise<Category[]> {
  return repository.findAll(workspaceId);
}

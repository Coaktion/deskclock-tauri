import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { UUID } from "@shared/types";

export async function deleteCategory(
  repository: ICategoryRepository,
  id: UUID
): Promise<void> {
  await repository.delete(id);
}

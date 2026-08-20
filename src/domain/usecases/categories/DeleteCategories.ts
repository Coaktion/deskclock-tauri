import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { UUID } from "@shared/types";

export async function deleteCategories(
  repository: ICategoryRepository,
  ids: UUID[]
): Promise<void> {
  if (ids.length === 0) return;
  await repository.deleteMany(ids);
}

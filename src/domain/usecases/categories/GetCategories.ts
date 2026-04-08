import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Category } from "@domain/entities/Category";

export async function getCategories(repository: ICategoryRepository): Promise<Category[]> {
  return repository.findAll();
}

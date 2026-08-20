import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Category } from "@domain/entities/Category";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { generateUUID } from "@shared/utils/uuid";
import type { UUID } from "@shared/types";

export async function createCategory(
  repository: ICategoryRepository,
  name: string,
  defaultBillable: boolean,
  workspaceId: UUID
): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("O nome da categoria não pode ser vazio.");

  const existing = await repository.findByName(trimmed, workspaceId);
  if (existing) throw new DuplicateNameError(`Categoria "${trimmed}" já existe.`);

  const category: Category = { id: generateUUID(), workspaceId, name: trimmed, defaultBillable };
  await repository.save(category);
  return category;
}

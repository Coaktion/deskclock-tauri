import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import { DomainError, DuplicateNameError } from "@shared/errors";
import type { UUID } from "@shared/types";

export async function updateCategory(
  repository: ICategoryRepository,
  id: UUID,
  name: string,
  defaultBillable: boolean
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("O nome da categoria não pode ser vazio.");

  const existing = await repository.findByName(trimmed);
  if (existing && existing.id !== id) throw new DuplicateNameError(`Categoria "${trimmed}" já existe.`);

  await repository.update(id, trimmed, defaultBillable);
}

import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import { DomainError, DuplicateNameError } from "@shared/errors";
import type { UUID } from "@shared/types";

export async function updateProject(
  repository: IProjectRepository,
  id: UUID,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("O nome do projeto não pode ser vazio.");

  const existing = await repository.findByName(trimmed);
  if (existing && existing.id !== id) throw new DuplicateNameError(`Projeto "${trimmed}" já existe.`);

  await repository.update(id, trimmed);
}

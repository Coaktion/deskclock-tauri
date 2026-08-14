import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { nextProjectColorIndex } from "@domain/utils/projectColorIndex";
import { generateUUID } from "@shared/utils/uuid";
import type { UUID } from "@shared/types";

export async function createProject(
  repository: IProjectRepository,
  name: string,
  workspaceId: UUID
): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("O nome do projeto não pode ser vazio.");

  const existing = await repository.findByName(trimmed, workspaceId);
  if (existing) throw new DuplicateNameError(`Projeto "${trimmed}" já existe.`);

  // O catálogo inteiro do workspace, e não só a contagem: o slot livre pode ser
  // um buraco no meio, deixado por projeto excluído.
  const doWorkspace = await repository.findAll(workspaceId);

  const project: Project = {
    id: generateUUID(),
    workspaceId,
    name: trimmed,
    colorIndex: nextProjectColorIndex(doWorkspace),
  };
  await repository.save(project);
  return project;
}

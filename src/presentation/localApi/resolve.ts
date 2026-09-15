import { ConflictError } from "./errors";
import type { LocalApiDeps } from "./types";

/** `workspaceId` ausente = workspace ativo, como na UI (§6.7). */
export async function resolveRequestWorkspace(
  deps: LocalApiDeps,
  workspaceId: string | null | undefined
): Promise<string> {
  if (!workspaceId) return deps.activeWorkspaceId;
  const workspace = await deps.workspaceRepo.findById(workspaceId);
  if (!workspace) throw new ConflictError(`Workspace '${workspaceId}' não encontrado`);
  return workspaceId;
}

export async function resolveProjectId(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | null | undefined,
  name: string | null | undefined
): Promise<string | null> {
  if (id) {
    const projects = await deps.projectRepo.findAll(workspaceId);
    if (!projects.some((p) => p.id === id)) {
      throw new ConflictError(`Projeto com id '${id}' não encontrado no workspace`);
    }
    return id;
  }
  if (name) {
    const project = await deps.projectRepo.findByName(name, workspaceId);
    if (!project) throw new ConflictError(`Projeto com nome '${name}' não encontrado no workspace`);
    return project.id;
  }
  return null;
}

export async function resolveCategoryId(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | null | undefined,
  name: string | null | undefined
): Promise<string | null> {
  if (id) {
    const categories = await deps.categoryRepo.findAll(workspaceId);
    if (!categories.some((c) => c.id === id)) {
      throw new ConflictError(`Categoria com id '${id}' não encontrada no workspace`);
    }
    return id;
  }
  if (name) {
    const category = await deps.categoryRepo.findByName(name, workspaceId);
    if (!category) {
      throw new ConflictError(`Categoria com nome '${name}' não encontrada no workspace`);
    }
    return category.id;
  }
  return null;
}

import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { ConflictError, NotFoundError } from "./errors";
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

async function findProject(deps: LocalApiDeps, workspaceId: string, id: string | undefined) {
  return (await deps.projectRepo.findAll(workspaceId)).find((p) => p.id === id);
}

async function findCategory(deps: LocalApiDeps, workspaceId: string, id: string | undefined) {
  return (await deps.categoryRepo.findAll(workspaceId)).find((c) => c.id === id);
}

// Id no path de outro workspace é 404: a rota é escopada, e ali ele não existe.
export async function findProjectInWorkspace(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | undefined
): Promise<Project> {
  const project = await findProject(deps, workspaceId, id);
  if (!project) throw new NotFoundError(`Projeto '${id}' não encontrado no workspace`);
  return project;
}

export async function findCategoryInWorkspace(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | undefined
): Promise<Category> {
  const category = await findCategory(deps, workspaceId, id);
  if (!category) throw new NotFoundError(`Categoria '${id}' não encontrada no workspace`);
  return category;
}

// Id ou nome referenciado no corpo é 409: o recurso da rota existe, a referência não.
export async function resolveProjectId(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | null | undefined,
  name: string | null | undefined
): Promise<string | null> {
  if (id) {
    if (!(await findProject(deps, workspaceId, id))) {
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
    if (!(await findCategory(deps, workspaceId, id))) {
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

/**
 * §6.2 pela API: trocar a categoria sem mandar `billable` aplica o
 * `defaultBillable` da nova, como a escolha de categoria faz na tela. `billable`
 * enviado sempre vence; categoria limpa ou reenviada igual preserva o atual.
 */
export async function billableForCategoryChange(
  deps: LocalApiDeps,
  workspaceId: string,
  body: { billable?: boolean | null },
  patch: { categoryId?: string | null },
  currentCategoryId: string | null
): Promise<{ billable?: boolean }> {
  if (typeof body.billable === "boolean") return { billable: body.billable };
  if (!patch.categoryId || patch.categoryId === currentCategoryId) return {};
  const category = await findCategory(deps, workspaceId, patch.categoryId);
  return category ? { billable: category.defaultBillable } : {};
}

export interface CatalogRefs {
  projectId?: string | null;
  projectName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
}

const has = (body: object, key: string) => Object.prototype.hasOwnProperty.call(body, key);

/**
 * Projeto e categoria de uma edição parcial: só entra no resultado o que o
 * corpo trouxe, e `null` limpa. Sem distinguir ausente de `null`, um PATCH que
 * só renomeia apagaria o projeto da tarefa.
 */
export async function resolveCatalogPatch(
  deps: LocalApiDeps,
  workspaceId: string,
  body: CatalogRefs
): Promise<{ projectId?: string | null; categoryId?: string | null }> {
  const patch: { projectId?: string | null; categoryId?: string | null } = {};
  if (has(body, "projectId") || has(body, "projectName")) {
    patch.projectId = await resolveProjectId(deps, workspaceId, body.projectId, body.projectName);
  }
  if (has(body, "categoryId") || has(body, "categoryName")) {
    patch.categoryId = await resolveCategoryId(
      deps,
      workspaceId,
      body.categoryId,
      body.categoryName
    );
  }
  return patch;
}

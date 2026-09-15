import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { updateProject } from "@domain/usecases/projects/UpdateProject";
import { deleteProject } from "@domain/usecases/projects/DeleteProject";
import { deleteProjects } from "@domain/usecases/projects/DeleteProjects";
import { bulkImportProjects } from "@domain/usecases/projects/BulkImportProjects";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { updateCategory } from "@domain/usecases/categories/UpdateCategory";
import { deleteCategory } from "@domain/usecases/categories/DeleteCategory";
import { deleteCategories } from "@domain/usecases/categories/DeleteCategories";
import { bulkImportCategories } from "@domain/usecases/categories/BulkImportCategories";
import { NotFoundError } from "../errors";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiDeps, LocalApiHandler } from "../types";

interface ScopedBody {
  workspaceId?: string | null;
}

interface ProjectBody extends ScopedBody {
  name: string;
}

interface CategoryBody extends ScopedBody {
  name: string;
  defaultBillable?: boolean | null;
}

interface ImportBody extends ScopedBody {
  text: string;
}

interface DeleteManyBody extends ScopedBody {
  ids: string[];
}

function projectDto(p: Project) {
  return { id: p.id, workspaceId: p.workspaceId, name: p.name, colorIndex: p.colorIndex };
}

function categoryDto(c: Category) {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    name: c.name,
    defaultBillable: c.defaultBillable,
  };
}

// Id de outro workspace é 404: a rota é escopada, e ali ele não existe.
export async function findProjectInWorkspace(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | undefined
): Promise<Project> {
  const project = (await deps.projectRepo.findAll(workspaceId)).find((p) => p.id === id);
  if (!project) throw new NotFoundError(`Projeto '${id}' não encontrado no workspace`);
  return project;
}

async function findCategoryInWorkspace(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | undefined
): Promise<Category> {
  const category = (await deps.categoryRepo.findAll(workspaceId)).find((c) => c.id === id);
  if (!category) throw new NotFoundError(`Categoria '${id}' não encontrada no workspace`);
  return category;
}

// Tudo ou nada: apagar só parte do lote esconderia do cliente o id que errou.
function assertAllInWorkspace(ids: string[], items: { id: string }[], label: string) {
  const known = new Set(items.map((i) => i.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new NotFoundError(`${label} não encontrados no workspace: ${missing.join(", ")}`);
  }
}

// ---------------- Projetos ----------------

export const listProjects: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const projects = await getProjects(deps.projectRepo, workspaceId);
  return { status: 200, body: projects.map(projectDto) };
};

export const createProjectHandler: LocalApiHandler = async (deps, params) => {
  const body = params.body as ProjectBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const project = await createProject(deps.projectRepo, body.name, workspaceId);
  await deps.notifyProjectsChanged();
  return { status: 201, body: projectDto(project) };
};

export const updateProjectHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findProjectInWorkspace(deps, workspaceId, params.id);
  const body = params.body as ProjectBody;
  await updateProject(deps.projectRepo, existing.id, body.name, workspaceId);
  await deps.notifyProjectsChanged();
  return {
    status: 200,
    body: projectDto(await findProjectInWorkspace(deps, workspaceId, existing.id)),
  };
};

export const deleteProjectHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findProjectInWorkspace(deps, workspaceId, params.id);
  await deleteProject(deps.projectRepo, existing.id);
  await deps.notifyProjectsChanged();
  return { status: 204, body: null };
};

export const importProjects: LocalApiHandler = async (deps, params) => {
  const body = params.body as ImportBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const result = await bulkImportProjects(deps.projectRepo, body.text, workspaceId);
  await deps.notifyProjectsChanged();
  return { status: 200, body: result };
};

export const deleteManyProjects: LocalApiHandler = async (deps, params) => {
  const body = params.body as DeleteManyBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  assertAllInWorkspace(body.ids, await deps.projectRepo.findAll(workspaceId), "Projetos");
  await deleteProjects(deps.projectRepo, body.ids);
  await deps.notifyProjectsChanged();
  return { status: 204, body: null };
};

// ---------------- Categorias ----------------

export const listCategories: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const categories = await getCategories(deps.categoryRepo, workspaceId);
  return { status: 200, body: categories.map(categoryDto) };
};

export const createCategoryHandler: LocalApiHandler = async (deps, params) => {
  const body = params.body as CategoryBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const category = await createCategory(
    deps.categoryRepo,
    body.name,
    body.defaultBillable ?? true,
    workspaceId
  );
  await deps.notifyCategoriesChanged();
  return { status: 201, body: categoryDto(category) };
};

export const updateCategoryHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findCategoryInWorkspace(deps, workspaceId, params.id);
  const body = params.body as CategoryBody;
  await updateCategory(
    deps.categoryRepo,
    existing.id,
    body.name,
    body.defaultBillable ?? existing.defaultBillable,
    workspaceId
  );
  await deps.notifyCategoriesChanged();
  return {
    status: 200,
    body: categoryDto(await findCategoryInWorkspace(deps, workspaceId, existing.id)),
  };
};

export const deleteCategoryHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findCategoryInWorkspace(deps, workspaceId, params.id);
  await deleteCategory(deps.categoryRepo, existing.id);
  await deps.notifyCategoriesChanged();
  return { status: 204, body: null };
};

export const importCategories: LocalApiHandler = async (deps, params) => {
  const body = params.body as ImportBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const result = await bulkImportCategories(deps.categoryRepo, body.text, workspaceId);
  await deps.notifyCategoriesChanged();
  return { status: 200, body: result };
};

export const deleteManyCategories: LocalApiHandler = async (deps, params) => {
  const body = params.body as DeleteManyBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  assertAllInWorkspace(body.ids, await deps.categoryRepo.findAll(workspaceId), "Categorias");
  await deleteCategories(deps.categoryRepo, body.ids);
  await deps.notifyCategoriesChanged();
  return { status: 204, body: null };
};

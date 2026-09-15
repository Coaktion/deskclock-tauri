import type { ProjectCategory } from "@domain/entities/ProjectCategory";
import { ConflictError } from "../errors";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiHandler } from "../types";
import { findProjectInWorkspace } from "./catalog";

function projectCategoryDto(row: ProjectCategory) {
  return { categoryId: row.categoryId, source: row.source, createdAt: row.createdAt };
}

export const listProjectCategories: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const project = await findProjectInWorkspace(deps, workspaceId, params.id);
  const rows = await deps.projectCategoryRepo.findByProject(project.id);
  return { status: 200, body: rows.map(projectCategoryDto) };
};

export const setProjectCategories: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const project = await findProjectInWorkspace(deps, workspaceId, params.id);
  const { categoryIds } = params.body as { categoryIds: string[] };
  const unique = [...new Set(categoryIds)];

  const known = new Set((await deps.categoryRepo.findAll(project.workspaceId)).map((c) => c.id));
  const foreign = unique.filter((id) => !known.has(id));
  if (foreign.length > 0) {
    throw new ConflictError(
      `Categorias não encontradas no workspace do projeto: ${foreign.join(", ")}`
    );
  }

  await deps.projectCategoryRepo.setForProject(project.id, unique);
  await deps.notifyProjectCategoriesChanged();
  const rows = await deps.projectCategoryRepo.findByProject(project.id);
  return { status: 200, body: rows.map(projectCategoryDto) };
};

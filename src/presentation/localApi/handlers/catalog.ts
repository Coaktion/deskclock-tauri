import { getProjects } from "@domain/usecases/projects/GetProjects";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiHandler } from "../types";

export const listProjects: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const projects = await getProjects(deps.projectRepo, workspaceId);
  return {
    status: 200,
    body: projects.map((p) => ({ id: p.id, workspaceId: p.workspaceId, name: p.name })),
  };
};

export const listCategories: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const categories = await getCategories(deps.categoryRepo, workspaceId);
  return {
    status: 200,
    body: categories.map((c) => ({
      id: c.id,
      workspaceId: c.workspaceId,
      name: c.name,
      defaultBillable: c.defaultBillable,
    })),
  };
};

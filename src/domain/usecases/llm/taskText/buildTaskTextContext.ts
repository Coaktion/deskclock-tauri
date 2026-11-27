import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { ProjectCategory } from "@domain/entities/ProjectCategory";
import { activeCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { buildProjectCategoryMap } from "@domain/usecases/projectCategories/buildProjectCategoryMap";
import { buildTaskFieldHints } from "./buildTaskFieldHints";
import type { TaskFieldHint, TaskTextCatalog } from "./types";

export interface TaskTextContextInput {
  projects: Project[];
  categories: Category[];
  associations: ProjectCategory[];
  /** Todos os campos, arquivados inclusive — o recorte dos ativos é daqui. */
  customFields: CustomField[];
}

export interface TaskTextContext {
  hints: TaskFieldHint[];
  catalog: TaskTextCatalog;
}

/**
 * O que a instrução e o casamento consultam, montado do mesmo jeito para a tela
 * e para a API local: o catálogo do workspace e só os campos ativos.
 */
export function buildTaskTextContext(input: TaskTextContextInput): TaskTextContext {
  const catalog: TaskTextCatalog = {
    projects: input.projects,
    categories: input.categories,
    projectCategoryMap: buildProjectCategoryMap(input.associations),
    customFields: activeCustomFields(input.customFields),
  };
  return { hints: buildTaskFieldHints(catalog.customFields, catalog), catalog };
}

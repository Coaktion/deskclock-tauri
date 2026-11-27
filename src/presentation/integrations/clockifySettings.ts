import type { IClockifyApi } from "@domain/integrations/IClockifyApi";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { projectDisplayName } from "@domain/usecases/clockify/clockifyEntries";
import {
  clockifyMappingsFor,
  withClockifyCategoryMapping,
  withClockifyProjectMapping,
} from "@domain/usecases/clockify/clockifyMappings";
import { createProject } from "@domain/usecases/projects/CreateProject";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type {
  ClockifyCategoryMapping,
  ClockifyProjectMapping,
  ClockifyWorkspaceRef,
} from "@shared/types/clockifyConfig";

// O que as seções "Workspace Clockify" e "Mapeamentos" do card do Clockify
// fazem, fora dos componentes: a API local grava pelas mesmas funções
// (`docs-internal/specs/mcp.md` §7, Fase D3b). Estado de tela, toasts e o
// recarregar das listas ficam nos componentes.

export type ClockifySettingsConfig = Pick<ConfigContextValue, "get" | "set">;

export interface ClockifyRef {
  id: string;
  name: string;
}

/** "Atualizar lista" do Workspace Clockify: relê e guarda o cache que o seletor mostra. */
export async function refreshClockifyWorkspaces(
  config: ClockifySettingsConfig,
  api: IClockifyApi
): Promise<ClockifyWorkspaceRef[]> {
  const list = await api.listWorkspaces();
  await config.set("clockifyWorkspaceCache", list);
  return list;
}

/** Troca o workspace do Clockify: o id e o nome exibido, juntos. */
export async function selectClockifyWorkspace(
  config: ClockifySettingsConfig,
  workspace: ClockifyWorkspaceRef
): Promise<void> {
  await config.set("clockifyActiveWorkspaceId", workspace.id);
  await config.set("clockifyActiveWorkspaceName", workspace.name);
}

/** Projetos do Clockify pelo nome exibido ("Cliente - Projeto"), em ordem alfabética. */
export function clockifyProjectRefs(
  projects: { id: string; name: string; clientName?: string | null }[]
): ClockifyRef[] {
  return projects
    .map((p) => ({ id: p.id, name: projectDisplayName(p) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

export function clockifyTagRefs(tags: { id: string; name: string }[]): ClockifyRef[] {
  return tags.map((t) => ({ id: t.id, name: t.name }));
}

/** Vincula (ou, com `null`, desvincula) um projeto; devolve os vínculos do workspace do Clockify. */
export async function saveClockifyProjectMapping(
  config: ClockifySettingsConfig,
  clockifyWorkspaceId: string,
  deskclockProjectId: string,
  clockifyProject: ClockifyRef | null
): Promise<ClockifyProjectMapping[]> {
  const updated = withClockifyProjectMapping(
    config.get("clockifyProjectMapping"),
    clockifyWorkspaceId,
    deskclockProjectId,
    clockifyProject
  );
  await config.set("clockifyProjectMapping", updated);
  return clockifyMappingsFor(updated, clockifyWorkspaceId);
}

export async function saveClockifyCategoryMapping(
  config: ClockifySettingsConfig,
  clockifyWorkspaceId: string,
  deskclockCategoryId: string,
  tagIds: string[]
): Promise<ClockifyCategoryMapping[]> {
  const updated = withClockifyCategoryMapping(
    config.get("clockifyCategoryMapping"),
    clockifyWorkspaceId,
    deskclockCategoryId,
    tagIds
  );
  await config.set("clockifyCategoryMapping", updated);
  return clockifyMappingsFor(updated, clockifyWorkspaceId);
}

export interface ClockifyImportDeps {
  config: ClockifySettingsConfig;
  api: IClockifyApi;
  /** Workspace **do Clockify** de onde vêm projetos e tags. */
  clockifyWorkspaceId: string;
  /** Workspace **do DeskClock** em que projetos e categorias nascem. */
  deskclockWorkspaceId: string;
  /** A lista lida, para a tela atualizar o autocomplete sem outra consulta. */
  onFetched?: (refs: ClockifyRef[]) => void;
}

export interface ClockifyImportResult<TMapping> {
  /** Quantos itens o Clockify devolveu — o número do toast. */
  fetched: number;
  /** Os vínculos do workspace do Clockify como ficaram. */
  mappings: TMapping[];
}

/**
 * Lê a lista do Clockify, acha ou cria o item no DeskClock e **substitui** os
 * vínculos daquele workspace do Clockify pelos recém-montados; os de outros
 * workspaces ficam.
 */
async function runImport<TItem, TMapping extends { workspaceId: string }>(
  items: TItem[],
  buildMapping: (item: TItem) => Promise<TMapping | null>,
  all: TMapping[],
  clockifyWorkspaceId: string
): Promise<{ merged: TMapping[]; mappings: TMapping[] }> {
  const otherWS = all.filter((m) => m.workspaceId !== clockifyWorkspaceId);
  const mappings: TMapping[] = [];
  for (const item of items) {
    const mapping = await buildMapping(item);
    if (mapping) mappings.push(mapping);
  }
  return { merged: [...otherWS, ...mappings], mappings };
}

/** Acha pelo nome, ou cria; criação concorrente (nome que apareceu no meio) relê. */
async function findOrCreate<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>
): Promise<T | null> {
  const existing = await find();
  if (existing) return existing;
  try {
    return await create();
  } catch {
    return find();
  }
}

/**
 * "Importar do Clockify" dos projetos: um projeto do DeskClock por projeto do
 * Clockify (pelo nome exibido), já vinculado. Avisa as outras janelas: os
 * projetos nascem pelo repositório.
 */
export async function runClockifyProjectsImport(
  deps: ClockifyImportDeps & {
    projectRepo: IProjectRepository;
    notifyProjectsChanged: () => Promise<void>;
  }
): Promise<ClockifyImportResult<ClockifyProjectMapping>> {
  const { config, clockifyWorkspaceId: workspaceId, deskclockWorkspaceId } = deps;
  const list = await deps.api.listProjects(workspaceId);
  deps.onFetched?.(clockifyProjectRefs(list));
  const { merged, mappings } = await runImport(
    list,
    async (cp): Promise<ClockifyProjectMapping | null> => {
      const displayName = projectDisplayName(cp);
      const proj = await findOrCreate(
        () => deps.projectRepo.findByName(displayName, deskclockWorkspaceId),
        () => createProject(deps.projectRepo, displayName, deskclockWorkspaceId)
      );
      if (!proj) return null;
      return {
        deskclockProjectId: proj.id,
        clockifyProjectId: cp.id,
        clockifyProjectName: displayName,
        workspaceId,
      };
    },
    config.get("clockifyProjectMapping"),
    workspaceId
  );
  await config.set("clockifyProjectMapping", merged);
  await deps.notifyProjectsChanged();
  return { fetched: list.length, mappings };
}

/**
 * "Importar do Clockify" das tags: uma categoria (billable) por tag, vinculada à
 * tag. Categoria que já tinha tags vinculadas as mantém.
 */
export async function runClockifyTagsImport(
  deps: ClockifyImportDeps & {
    categoryRepo: ICategoryRepository;
    notifyCategoriesChanged: () => Promise<void>;
  }
): Promise<ClockifyImportResult<ClockifyCategoryMapping>> {
  const { config, clockifyWorkspaceId: workspaceId, deskclockWorkspaceId } = deps;
  const snapshot = config.get("clockifyCategoryMapping");
  const list = await deps.api.listTags(workspaceId);
  deps.onFetched?.(clockifyTagRefs(list));
  const { merged, mappings } = await runImport(
    list,
    async (tag): Promise<ClockifyCategoryMapping | null> => {
      const cat = await findOrCreate(
        () => deps.categoryRepo.findByName(tag.name, deskclockWorkspaceId),
        () => createCategory(deps.categoryRepo, tag.name, true, deskclockWorkspaceId)
      );
      if (!cat) return null;
      const existingTagIds =
        snapshot.find((m) => m.deskclockCategoryId === cat.id && m.workspaceId === workspaceId)
          ?.clockifyTagIds ?? [];
      return {
        deskclockCategoryId: cat.id,
        clockifyTagIds: existingTagIds.length > 0 ? existingTagIds : [tag.id],
        workspaceId,
      };
    },
    snapshot,
    workspaceId
  );
  await config.set("clockifyCategoryMapping", merged);
  await deps.notifyCategoriesChanged();
  return { fetched: list.length, mappings };
}

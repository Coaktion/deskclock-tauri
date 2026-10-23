import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import {
  activityTypeCatalog,
  importMondayCategories,
  type ImportMondayCategoriesResult,
} from "@domain/usecases/monday/importMondayCategories";
import { importMondayFieldCatalogs } from "@domain/usecases/monday/importMondayFieldCatalogs";
import {
  importMondayProjects,
  type ImportMondayProjectsResult,
} from "@domain/usecases/monday/importMondayProjects";
import { MONDAY_MAPPING_CACHE_VERSION } from "@domain/usecases/monday/mondayMappingCachePolicy";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import {
  seedMondayProjectCategories,
  type SeedMondayProjectCategoriesResult,
} from "@domain/usecases/monday/seedMondayProjectCategories";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { EMPTY_FIELD_CATALOGS, type MondayFieldCatalogs } from "@shared/types/mondayConfig";
import { todayISO } from "@shared/utils/time";

// Os três botões da "Importação de dados" do Monday (Projetos, Catálogos,
// Categorias), fora dos cards: a API local roda o mesmo clique
// (`docs-internal/specs/mcp.md` §7, Fase D1). O toast e o estado da tela ficam
// nos cards.

/** Destino dos três: o workspace da integração, nunca o ativo. */
export function mondayDestinationWorkspaceId(config: ConfigContextValue): string {
  return resolveIntegrationWorkspaceId(
    config.isLoaded ? config.get("mondayDeskclockWorkspaceId") : ""
  );
}

export interface MondayProjectsImportDeps {
  config: ConfigContextValue;
  api: IMondayApi;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
  projectCategoryRepo: IProjectCategoryRepository;
  notifyProjectsChanged: () => Promise<void>;
  notifyProjectCategoriesChanged: () => Promise<void>;
}

export interface MondayProjectsImportResult extends ImportMondayProjectsResult {
  seeded: SeedMondayProjectCategoriesResult;
}

/** Por que o "Importar"/"Atualizar" de Projetos não pode rodar, ou `null`. */
export function mondayProjectsImportBlocker(config: ConfigContextValue): string | null {
  if (!config.isLoaded || !config.get("mondayApiKey")) {
    return "Monday não configurado. Verifique o token e o workspace.";
  }
  if (!config.get("mondayPortfolioBoardId")) {
    return "Informe o id do board de Portfólio em Integrações.";
  }
  return null;
}

/**
 * O "Importar"/"Atualizar" de Projetos: relê o Portfólio com o schema de todos
 * os boards (ignorando a validade do cache), grava os vínculos, semeia as
 * categorias de cada projeto e marca o trabalho do dia.
 */
export async function runMondayProjectsImport(
  deps: MondayProjectsImportDeps,
  onProgress?: (done: number, total: number) => void
): Promise<MondayProjectsImportResult> {
  const { config } = deps;
  const deskclockWorkspaceId = mondayDestinationWorkspaceId(config);
  const result = await importMondayProjects({
    api: deps.api,
    projectRepo: deps.projectRepo,
    portfolioBoardId: config.get("mondayPortfolioBoardId"),
    deskclockWorkspaceId,
    // Sem isto, o quadro digitado à mão seria desfeito no primeiro
    // "Atualizar": o Portfólio devolve a coluna vazia.
    existingMappings: normalizeProjectMappings(config.get("mondayProjectMapping")),
    nowISO: new Date().toISOString(),
    // O clique relê o schema de todos os boards, ignorando a validade do
    // cache — mesmo papel do `forceWrite` no envio manual de horas. É o
    // caminho de quem acabou de criar um rótulo no board e quer vê-lo aqui.
    forceSchemaRead: true,
    onProgress,
  });

  await config.set("mondayProjectMapping", result.mappings);

  // Os Activity Types de cada board viram as categorias que o projeto
  // oferece. Não custa consulta nova — os rótulos vieram no import.
  const seeded = await seedMondayProjectCategories({
    mappings: result.mappings,
    categoryRepo: deps.categoryRepo,
    projectCategoryRepo: deps.projectCategoryRepo,
    workspaceId: deskclockWorkspaceId,
  });

  // O clique acabou de fazer o trabalho do dia: marcar a data evita que a
  // releitura automática repita a mesma varredura horas depois, e limpar o
  // erro tira da tela uma falha que deixou de valer.
  await config.set("mondayProjectsSyncLastDate", todayISO());
  // E fez também o da migração, com o mesmo `forceSchemaRead` sobre os mesmos
  // boards: sem marcar a versão, quem consertou à mão pagaria a varredura
  // forçada de novo no tique seguinte.
  await config.set("mondayMappingCacheVersion", MONDAY_MAPPING_CACHE_VERSION);
  await config.set("mondayProjectsLastSyncError", "");

  // Os projetos nascem pelo repositório, sem passar pelas mutações de
  // `useProjects`: sem este aviso, o overlay não os enxergaria até reiniciar.
  await deps.notifyProjectsChanged();
  await deps.notifyProjectCategoriesChanged();

  return { ...result, seeded };
}

/** Os Activity Types que o import de Categorias cria — a conta da tela e do clique. */
export function mondayActivityTypeLabels(config: ConfigContextValue): string[] {
  if (!config.isLoaded) return [];
  return activityTypeCatalog(
    (config.get("mondayFieldCatalogs") ?? EMPTY_FIELD_CATALOGS).activityType,
    normalizeProjectMappings(config.get("mondayProjectMapping"))
  );
}

/** Por que o "Importar" de Categorias não pode rodar, ou `null` — o `title` do botão. */
export function mondayCategoriesImportBlocker(config: ConfigContextValue): string | null {
  return mondayActivityTypeLabels(config).length === 0
    ? "Leia os catálogos ou importe os projetos."
    : null;
}

/** O "Importar"/"Atualizar" de Categorias: uma categoria por Activity Type. */
export async function runMondayCategoriesImport(deps: {
  config: ConfigContextValue;
  categoryRepo: ICategoryRepository;
  notifyCategoriesChanged: () => Promise<void>;
}): Promise<ImportMondayCategoriesResult> {
  const { config } = deps;
  const result = await importMondayCategories({
    categoryRepo: deps.categoryRepo,
    catalogLabels: (config.get("mondayFieldCatalogs") ?? EMPTY_FIELD_CATALOGS).activityType,
    mappings: normalizeProjectMappings(config.get("mondayProjectMapping")),
    deskclockWorkspaceId: mondayDestinationWorkspaceId(config),
  });
  await deps.notifyCategoriesChanged();
  return result;
}

/** Por que o "Ler catálogos" não pode rodar, ou `null` — a frase do use case. */
export function mondayCatalogsReadBlocker(config: ConfigContextValue): string | null {
  if (!config.isLoaded || !config.get("mondayApiKey")) {
    return "Monday não configurado. Verifique o token e o workspace.";
  }
  return config.get("mondayReportBoardId")
    ? null
    : "Informe o id do board de Report de Horas em Integrações.";
}

/** O "Ler catálogos": uma leitura do board de Report, guardada na config. */
export async function runMondayCatalogsRead(deps: {
  config: ConfigContextValue;
  api: IMondayApi;
}): Promise<MondayFieldCatalogs> {
  const result = await importMondayFieldCatalogs({
    api: deps.api,
    reportBoardId: deps.config.get("mondayReportBoardId"),
  });
  await deps.config.set("mondayFieldCatalogs", result);
  return result;
}

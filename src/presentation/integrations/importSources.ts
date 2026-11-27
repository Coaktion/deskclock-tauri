import type { ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { ITicketImporter } from "@domain/integrations/ITicketImporter";
import type { ImportMondayCategoriesResult } from "@domain/usecases/monday/importMondayCategories";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { DEFAULT_SHOW_WEEKEND } from "@shared/types/appConfig";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";
import type { MondayFieldCatalogs, MondayProjectMapping } from "@shared/types/mondayConfig";
import {
  mondayCatalogsReadBlocker,
  mondayCategoriesImportBlocker,
  mondayDestinationWorkspaceId,
  mondayProjectsImportBlocker,
  runMondayCatalogsRead,
  runMondayCategoriesImport,
  runMondayProjectsImport,
  type MondayProjectsImportDeps,
  type MondayProjectsImportResult,
} from "./mondayCatalogImports";

// O que cada import da tela lê da config e das fábricas, montado fora de
// componente para a API local importar como os modais
// (`docs-internal/specs/mcp.md` §7, Fase D1). Cada fonte diz se a integração
// está conectada — os modais nem abrem sem isso (o botão some).

export const GOOGLE_CALENDAR_NOT_CONNECTED =
  "Google Agenda não conectado. Conecte o Google em Integrações.";
export const ZENDESK_NOT_CONNECTED = "Zendesk não conectado. Conecte o Zendesk em Integrações.";
/** A mesma frase do envio manual ao Monday (`taskSendAdapters.ts`). */
export const MONDAY_NOT_CONFIGURED = "Monday não configurado. Verifique o token e o workspace.";

export interface CalendarImportSource {
  /** `null` com o Google conectado. */
  notConfiguredMessage: string | null;
  importer: ICalendarImporter;
  /**
   * `calendarDeskclockWorkspaceId`. Vale só para o import manual: o rastreio
   * automático de reuniões cria no workspace ativo — a exceção da Agenda.
   */
  workspaceId: string;
  showWeekend: boolean;
  ignoreRules: CalendarIgnoreRule[];
}

export interface ZendeskImportSource {
  notConfiguredMessage: string | null;
  importer: ITicketImporter;
  workspaceId: string;
}

export interface MondayImportSource {
  notConfiguredMessage: string | null;
  api: IMondayApi;
  workspaceId: string;
  /** `mondayUserId` — sem ele a busca traria o board do time inteiro. */
  personId: string;
  mappings: MondayProjectMapping[];
  /** `mondayProjectStageFieldId`: o campo personalizado da etapa, ou vazio. */
  stageFieldId: string;
  projectsBlocker: string | null;
  importProjects(): Promise<MondayProjectsImportResult>;
  categoriesBlocker: string | null;
  importCategories(): Promise<ImportMondayCategoriesResult>;
  catalogsBlocker: string | null;
  readCatalogs(): Promise<MondayFieldCatalogs>;
}

export function buildCalendarImportSource(
  config: ConfigContextValue,
  factories: IntegrationFactories
): CalendarImportSource {
  const connected = config.isLoaded && !!config.get("googleRefreshToken");
  return {
    notConfiguredMessage: connected ? null : GOOGLE_CALENDAR_NOT_CONNECTED,
    importer: factories.createCalendarImporter(),
    workspaceId: resolveIntegrationWorkspaceId(
      config.isLoaded ? config.get("calendarDeskclockWorkspaceId") : ""
    ),
    showWeekend: config.isLoaded ? config.get("showWeekend") : DEFAULT_SHOW_WEEKEND,
    ignoreRules: config.isLoaded ? config.get("calendarIgnoreRules") : [],
  };
}

export function buildZendeskImportSource(
  config: ConfigContextValue,
  factories: IntegrationFactories
): ZendeskImportSource {
  const connected = config.isLoaded && !!config.get("zendeskAccessToken");
  return {
    notConfiguredMessage: connected ? null : ZENDESK_NOT_CONNECTED,
    importer: factories.createTicketImporter(),
    workspaceId: resolveIntegrationWorkspaceId(
      config.isLoaded ? config.get("zendeskDeskclockWorkspaceId") : ""
    ),
  };
}

export type MondayImportRepos = Omit<MondayProjectsImportDeps, "config" | "api"> & {
  notifyCategoriesChanged: () => Promise<void>;
};

export function buildMondayImportSource(
  config: ConfigContextValue,
  factories: IntegrationFactories,
  repos: MondayImportRepos
): MondayImportSource {
  const connected = config.isLoaded && !!config.get("mondayApiKey");
  const api = factories.createMondayApi();
  return {
    notConfiguredMessage: connected ? null : MONDAY_NOT_CONFIGURED,
    api,
    workspaceId: mondayDestinationWorkspaceId(config),
    personId: config.isLoaded ? config.get("mondayUserId") : "",
    mappings: config.isLoaded ? config.get("mondayProjectMapping") : [],
    stageFieldId: config.isLoaded ? config.get("mondayProjectStageFieldId") : "",
    projectsBlocker: mondayProjectsImportBlocker(config),
    importProjects: () => runMondayProjectsImport({ ...repos, config, api }),
    categoriesBlocker: mondayCategoriesImportBlocker(config),
    importCategories: () =>
      runMondayCategoriesImport({
        config,
        categoryRepo: repos.categoryRepo,
        notifyCategoriesChanged: repos.notifyCategoriesChanged,
      }),
    catalogsBlocker: mondayCatalogsReadBlocker(config),
    readCatalogs: () => runMondayCatalogsRead({ config, api }),
  };
}

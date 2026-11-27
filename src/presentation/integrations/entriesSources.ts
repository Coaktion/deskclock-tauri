import type { IClockifyApi } from "@domain/integrations/IClockifyApi";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

// O que "Apontamentos do Clockify" e "Atividades no Monday" leem da config, fora
// dos modais para a API local ler os mesmos lançamentos (`docs-internal/specs/mcp.md`
// §7, Fase D2). Cada fonte diz se a integração está configurada com o mesmo
// critério do aviso que o modal mostra no lugar da lista.

/** O aviso do modal, sem o "antes de abrir esta janela" que só faz sentido nele. */
export const CLOCKIFY_ENTRIES_NOT_CONFIGURED =
  "Configure o Clockify (API Key + workspace) na tela de Integrações.";
export const MONDAY_ENTRIES_NOT_CONFIGURED =
  "Conecte o Monday e importe os projetos na tela de Integrações.";

export interface ClockifyEntriesSource {
  notConfiguredMessage: string | null;
  api: IClockifyApi;
  /** Workspace **do Clockify**, não do DeskClock. */
  workspaceId: string;
  workspaceName: string;
  userId: string;
  defaultTagIds: string[];
}

export interface MondayEntriesSource {
  notConfiguredMessage: string | null;
  api: IMondayApi;
  userId: string;
  /** Só projeto com board de destino, como o modal. */
  mappings: MondayProjectMapping[];
}

export function buildClockifyEntriesSource(
  config: ConfigContextValue,
  factories: Pick<IntegrationFactories, "createClockifyApi">
): ClockifyEntriesSource {
  const apiKey = config.isLoaded ? config.get("clockifyApiKey") : "";
  const workspaceId = config.isLoaded ? config.get("clockifyActiveWorkspaceId") : "";
  const userId = config.isLoaded ? config.get("clockifyUserId") : "";
  return {
    notConfiguredMessage: apiKey && workspaceId && userId ? null : CLOCKIFY_ENTRIES_NOT_CONFIGURED,
    api: factories.createClockifyApi(),
    workspaceId,
    workspaceName: config.isLoaded ? config.get("clockifyActiveWorkspaceName") : "",
    userId,
    defaultTagIds: config.isLoaded ? config.get("clockifyDefaultTagIds") : [],
  };
}

export function buildMondayEntriesSource(
  config: ConfigContextValue,
  factories: Pick<IntegrationFactories, "createMondayApi">
): MondayEntriesSource {
  const apiKey = config.isLoaded ? config.get("mondayApiKey") : "";
  const userId = config.isLoaded ? config.get("mondayUserId") : "";
  const mappings = config.isLoaded
    ? normalizeProjectMappings(config.get("mondayProjectMapping")).filter((m) => !!m.mondayBoardId)
    : [];
  return {
    notConfiguredMessage:
      apiKey && userId && mappings.length > 0 ? null : MONDAY_ENTRIES_NOT_CONFIGURED,
    api: factories.createMondayApi(),
    userId,
    mappings,
  };
}

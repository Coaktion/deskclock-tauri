import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { normalizeProjectMappings } from "./normalizeProjectMappings";

/** As chaves de config que decidem se a integração está de pé. */
export interface MondayReadinessConfig {
  apiKey: string;
  activeWorkspaceId: string;
  projectMapping: MondayProjectMapping[] | undefined;
  internalBoardId: string;
  projectStageFieldId: string;
}

/**
 * Se a integração do Monday está configurada ponta a ponta.
 *
 * Diferente do Clockify e do Google, ter a chave de API não basta: o Monday só
 * é utilizável depois de o usuário escolher os boards, o board interno e o
 * campo que alimenta o Project Stage. Sem qualquer um deles, todas as ações da
 * integração abrem em estado vazio ou recusam o envio — a coluna Project Stage
 * é exigida na escrita das horas.
 *
 * **Os boards contam pelo workspace ativo do Monday**, não pelo total: o
 * mapeamento guarda os vínculos de todos os workspaces, e trocar para um
 * workspace ainda não importado deixa a integração sem board algum a consultar.
 */
export function isMondayReady(config: MondayReadinessConfig): boolean {
  if (!config.apiKey) return false;
  if (!config.internalBoardId) return false;
  if (!config.projectStageFieldId) return false;

  return normalizeProjectMappings(config.projectMapping).some(
    (m) => m.workspaceId === config.activeWorkspaceId
  );
}

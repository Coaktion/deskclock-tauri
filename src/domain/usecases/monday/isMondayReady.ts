import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { normalizeProjectMappings } from "./normalizeProjectMappings";

/** As chaves de config que decidem se a integração está de pé. */
export interface MondayReadinessConfig {
  apiKey: string;
  /** Board que lista os projetos. */
  portfolioBoardId: string;
  /** Board que guarda o catálogo canônico dos rótulos. */
  reportBoardId: string;
  projectMapping: MondayProjectMapping[] | undefined;
}

/**
 * Se a integração do Monday está configurada ponta a ponta.
 *
 * Diferente do Clockify e do Google, ter a chave de API não basta: sem os dois
 * boards não há de onde tirar os projetos nem os rótulos, e sem projeto
 * importado não há board de destino a consultar. Todas as ações da integração
 * abririam em estado vazio.
 *
 * **Projeto sem quadro de destino não conta.** Ele existe de propósito — a
 * coluna "ID Quadro Projeto" está vazia em 14 dos 62 itens do Portfólio —, mas
 * as três ações do atalho consultam boards. Com projetos mas nenhum quadro,
 * elas abrem vazias, que é exatamente o que o atalho existe para evitar.
 */
export function isMondayReady(config: MondayReadinessConfig): boolean {
  if (!config.apiKey) return false;
  if (!config.portfolioBoardId) return false;
  if (!config.reportBoardId) return false;

  return normalizeProjectMappings(config.projectMapping).some((m) => !!m.mondayBoardId);
}

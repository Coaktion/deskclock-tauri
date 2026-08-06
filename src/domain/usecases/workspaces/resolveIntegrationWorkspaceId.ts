import type { UUID } from "@shared/types";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";

/**
 * Workspace do DeskClock em que uma integração trabalha.
 *
 * Cada integração escolhe o seu (`mondayDeskclockWorkspaceId` e irmãs), e é
 * isso que a faz rodar **independente do workspace aberto na tela**: antes o
 * destino era o ativo, então bastava estar num workspace pessoal na hora do
 * ciclo para a importação nascer no lugar errado e o envio considerar hora que
 * nunca deveria ter saído daqui.
 *
 * **Vazio significa "Padrão", e a resolução é na leitura.** Nada é gravado na
 * montagem do seletor para "migrar" quem já usava o app: quem tem um workspace
 * só nunca vê o seletor e não percebe mudança nenhuma, e a config só passa a
 * existir quando alguém de fato escolhe.
 */
export function resolveIntegrationWorkspaceId(configured: string | undefined): UUID {
  return configured || DEFAULT_WORKSPACE_ID;
}

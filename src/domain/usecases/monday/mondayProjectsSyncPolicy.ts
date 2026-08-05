import type { MondayProjectMapping } from "@shared/types/mondayConfig";

export interface MondayProjectsSyncState {
  apiKey: string;
  /** Board de onde a lista de projetos é lida. Sem ele não há o que reler. */
  portfolioBoardId: string;
  /** Dia (YYYY-MM-DD) da última releitura bem-sucedida. Vazio = nunca rodou. */
  lastSyncDate: string;
  /** Hoje, no fuso local de quem usa o app. */
  todayISO: string;
}

/**
 * Se a releitura do Portfólio deve acontecer agora.
 *
 * O rastreador tiquetaqueia a cada 30 min só para perceber a virada do dia — um
 * app aberto a semana inteira precisa notar a virada sem ser reaberto —, mas o
 * trabalho é **uma vez por dia**. A data só é gravada depois do sucesso, então
 * uma falha de rede volta a tentar no tique seguinte em vez de custar a
 * varredura do dia inteiro.
 */
export function shouldSyncMondayProjects(state: MondayProjectsSyncState): boolean {
  if (!state.apiKey || !state.portfolioBoardId) return false;
  return state.lastSyncDate !== state.todayISO;
}

/**
 * Se este workspace do DeskClock já recebe os projetos do Monday.
 *
 * É a prova de que alguém escolheu trazer o Portfólio para cá, e sem ela o
 * destino da releitura seria o workspace ativo, qualquer que fosse: bastava
 * estar num workspace pessoal na virada do dia para os 60 projetos da empresa
 * nascerem lá dentro. O vínculo mora na config e não sabe de workspace do
 * DeskClock, então quem responde é o projeto existir no destino.
 *
 * Provisória: sai quando a integração ganhar o workspace DeskClock associado em
 * config, e o destino deixar de depender de onde o usuário está.
 */
export function isMondayLinkedWorkspace(
  mappings: MondayProjectMapping[],
  projectIdsInWorkspace: Set<string>
): boolean {
  return mappings.some((m) => projectIdsInWorkspace.has(m.deskclockProjectId));
}

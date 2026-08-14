/**
 * O ▶ nunca some quando há tarefa em execução — ele fica desabilitado e diz o
 * porquê. Sumindo, a linha perdia uma ação sem explicar nada, e a tela ficava
 * diferente de si mesma dependendo do estado do cronômetro.
 *
 * São **dois** porquês, e distingui-los é o que evita a mensagem genérica na
 * única linha que sabe a resposta exata: iniciar a "Daily" e voltar o cursor
 * para o ▶ dela tem de dizer que é aquela que está rodando, não que "outra"
 * está.
 *
 * A redação mora aqui porque são seis call sites em quatro telas mais o popup:
 * copiada, a próxima já nasceria divergente.
 */
export type PlayBlock = "none" | "self" | "other";

export const PLAY_BLOCKED_TITLE = "Não é possível iniciar com outra tarefa em execução";
export const PLAY_SELF_TITLE = "Esta tarefa já está em execução";

/**
 * Compara a linha com a execução em curso pela chave que **aquela tela** tem: o
 * id da planejada nas listas de planejamento, o `taskGroupKey` (§6.3) nas
 * Entradas e nas Executadas, onde a tarefa em execução é outro registro e não há
 * id ligando os dois.
 *
 * Nas duas últimas, portanto, `self` significa "há uma execução com esta mesma
 * chave", não "é este registro" — que é a mesma leitura que o "Repetir tarefa"
 * já faz para decidir o que repetir.
 */
export function resolvePlayBlock(runningKey: string | null, rowKey: string): PlayBlock {
  if (!runningKey) return "none";
  return runningKey === rowKey ? "self" : "other";
}

/** O rótulo em repouso muda por tela ("Iniciar", "Repetir tarefa"); o bloqueio, não. */
export function playTitle(block: PlayBlock, idleTitle = "Iniciar"): string {
  if (block === "self") return PLAY_SELF_TITLE;
  if (block === "other") return PLAY_BLOCKED_TITLE;
  return idleTitle;
}

export function isPlayBlocked(block: PlayBlock): boolean {
  return block !== "none";
}

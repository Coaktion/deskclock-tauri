/**
 * Chave estável de um grupo unificado enviado ao Monday.
 *
 * Criar item no Monday não é idempotente, então o DeskClock guarda o `item_id`
 * retornado indexado por esta assinatura. Ela deriva do board de destino, do dia
 * local da tarefa (§6.6), da chave de agrupamento (nome|projeto|categoria) e do
 * tipo de cobrança — cada combinação é um item distinto no board.
 *
 * Atenção: nome e categoria são **editáveis** depois do envio, então a assinatura
 * sozinha não identifica o item para sempre. O rastreamento também guarda os
 * `task_ids` do grupo justamente para reencontrá-lo quando ela muda.
 */
export function mondayGroupSignature(
  boardId: string,
  dayISO: string,
  groupKey: string,
  billable: boolean
): string {
  return `${boardId}::${dayISO}::${groupKey}::${billable ? "billable" : "non-billable"}`;
}

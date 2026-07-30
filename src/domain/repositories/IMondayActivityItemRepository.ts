export interface MondayActivityItemRecord {
  boardId: string;
  itemId: string;
  signature: string;
  dayISO: string;
  /** Ids das tarefas do DeskClock que compõem este item. */
  taskIds: string[];
  /** `column_values` serializado do último envio, para detectar mudanças. */
  payload: string;
}

/**
 * Store de idempotência do envio ao Monday: a criação de item não é idempotente,
 * então guardamos o `item_id` retornado por grupo unificado para atualizar no
 * reenvio em vez de duplicar.
 */
export interface IMondayActivityItemRepository {
  /**
   * Lista **todos** os itens já criados que podem corresponder a um grupo:
   * o de assinatura idêntica (primeiro, quando existe) e os que compartilham
   * alguma tarefa no mesmo board e dia.
   *
   * São vários e não um porque nome e categoria são editáveis depois do envio:
   * quando o usuário renomeia duas tarefas para o mesmo nome, dois itens antigos
   * passam a disputar um único grupo — quem chama fica com um e apaga o resto.
   */
  findCandidates(
    boardId: string,
    dayISO: string,
    signature: string,
    taskIds: string[]
  ): Promise<MondayActivityItemRecord[]>;

  /** Upsert por (boardId, itemId) — a assinatura pode mudar entre envios. */
  save(record: MondayActivityItemRecord): Promise<void>;

  /** Remove o rastreamento de um item que não existe mais no Monday. */
  deleteItem(boardId: string, itemId: string): Promise<void>;
}

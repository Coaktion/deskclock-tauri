-- Store de idempotência do envio de horas ao Monday.com. Criar item via API não é
-- idempotente, então guardamos o item_id retornado para atualizar no reenvio em vez
-- de duplicar. A identidade do Monday fica confinada a esta tabela — tasks permanece
-- agnóstica à integração.
--
-- Chaveada por (board_id, item_id) e não pela assinatura porque a assinatura deriva de
-- campos editáveis (nome e categoria da tarefa): renomear uma tarefa já enviada muda a
-- assinatura, e é por isso que também guardamos os task_ids que compõem o item — a
-- reconciliação por interseção reencontra o item em vez de criar um segundo.
--
-- payload guarda o column_values serializado do último envio: comparar por ele (e não
-- só pela duração) faz o reenvio detectar mudanças de billable e de Activity Type.
CREATE TABLE IF NOT EXISTS monday_activity_items (
  board_id   TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  signature  TEXT NOT NULL,
  day_iso    TEXT NOT NULL,
  task_ids   TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (board_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_monday_activity_items_signature
  ON monday_activity_items (signature);

CREATE INDEX IF NOT EXISTS idx_monday_activity_items_board_day
  ON monday_activity_items (board_id, day_iso);

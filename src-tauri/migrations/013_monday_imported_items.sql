-- Rastreamento dos itens do Monday que viraram tarefas planejadas aqui. A identidade
-- do Monday fica confinada a esta tabela — planned_tasks permanece agnóstica à
-- integração, como em calendar_tracked_meetings e monday_activity_items.
--
-- A chave é (monday_item_id, workspace_id), e não o item sozinho: um mesmo board pode
-- estar mapeado a projetos de dois workspaces do DeskClock, e a planejada nasce em um
-- deles. Sem o workspace na chave, o segundo import sobrescreveria o vínculo do primeiro.
--
-- As colunas snap_* guardam o snapshot do último sync (nome, Timeline, Activity Type e
-- Project Stage). É o snapshot que separa "mudou no Monday" de "editei aqui": comparar a
-- planejada direto com o item faria toda edição local ser desfeita no ciclo seguinte.
CREATE TABLE IF NOT EXISTS monday_imported_items (
  monday_item_id    TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  board_id          TEXT NOT NULL,
  planned_task_id   TEXT NOT NULL,
  snap_name         TEXT NOT NULL,
  snap_period_start TEXT,
  snap_period_end   TEXT,
  snap_activity     TEXT NOT NULL DEFAULT '',
  snap_stage        TEXT NOT NULL DEFAULT '',
  imported_at       TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (monday_item_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_monday_imported_items_workspace
  ON monday_imported_items (workspace_id);

CREATE INDEX IF NOT EXISTS idx_monday_imported_items_planned_task
  ON monday_imported_items (planned_task_id);

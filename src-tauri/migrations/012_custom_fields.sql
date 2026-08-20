-- 012_custom_fields.sql — campos personalizados na tarefa e na tarefa planejada.
--
-- Aditiva: só cria tabelas. Ao contrário da 011, nenhuma tabela existente é
-- renomeada ou reconstruída, então o risco de FK descrito lá não se aplica —
-- e o rollback é dropar as três tabelas.
--
-- SEM `workspace_id`: campos personalizados são GLOBAIS por decisão de produto.
-- A razão estrutural: mover uma tarefa entre workspaces só é viável se o valor
-- do campo sobreviver sem reconciliação. Projeto e categoria já exigem
-- remapeamento; escopar os campos também triplicaria o modal de mover.
--
-- Modelo EAV em vez de uma coluna JSON em `tasks`: filtrar no histórico e
-- agrupar em SQL puro é inviável com JSON.

CREATE TABLE custom_fields (
  id         TEXT    NOT NULL PRIMARY KEY,
  label      TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'text'
                     CHECK(type IN ('text','multiline','select','checkbox')),
  -- JSON: array de { id, label } para 'select'; '[]' nos demais tipos.
  options    TEXT    NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Arquivar esconde o campo dos formulários sem apagar os valores já gravados,
  -- que continuam valendo no histórico, na exportação e na chave de agrupamento.
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

-- Os valores pertencem à tarefa, não ao campo: são carregados e gravados pelo
-- TaskRepository junto com a linha de `tasks`. O CASCADE em `field_id` é o que
-- torna a exclusão do campo uma operação atômica — sem ele, sobrariam valores
-- órfãos que voltariam a compor a chave de agrupamento.
CREATE TABLE task_custom_values (
  task_id  TEXT NOT NULL REFERENCES tasks(id)         ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value    TEXT NOT NULL,
  PRIMARY KEY (task_id, field_id)
);

-- Existe para que dar Play numa tarefa planejada já traga o valor preenchido.
CREATE TABLE planned_task_custom_values (
  planned_task_id TEXT NOT NULL REFERENCES planned_tasks(id) ON DELETE CASCADE,
  field_id        TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,
  PRIMARY KEY (planned_task_id, field_id)
);

CREATE INDEX idx_task_custom_values_field         ON task_custom_values(field_id);
CREATE INDEX idx_planned_task_custom_values_field ON planned_task_custom_values(field_id);

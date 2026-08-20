-- 011_workspaces.sql — workspaces: escopo de projetos, categorias, tarefas,
-- planejadas e perfis de exportação.
--
-- Restrição que dita a técnica: o sqlx (tauri-plugin-sql) roda cada migration
-- dentro de uma transação, e `PRAGMA foreign_keys = OFF` é no-op dentro de
-- transação (verificado). Logo a migration roda com FK LIGADO, e:
--
--   * `DROP TABLE projects` dispara o ON DELETE SET NULL de tasks.project_id e
--     zera o histórico em silêncio (reproduzido no spike: 500 -> 0).
--   * `ALTER TABLE projects RENAME TO ...` reescreve as cláusulas REFERENCES
--     das tabelas filhas. `PRAGMA legacy_alter_table = ON` NÃO evita isso
--     enquanto FK estiver ligado (verificado).
--
-- Técnica adotada: renomear projects/categories (o rename é inofensivo, não
-- apaga nada) e em seguida RECONSTRUIR tasks/planned_tasks/export_profiles,
-- que não são referenciadas por ninguém — nelas o DROP é seguro. A reconstrução
-- reescreve as cláusulas REFERENCES apontando de volta para os nomes corretos.
--
-- ATENÇÃO À MANUTENÇÃO: os CREATE TABLE abaixo replicam o schema dessas três
-- tabelas tal como está APÓS a migration 010. Se alguma migration anterior a
-- esta for alterada, este arquivo precisa acompanhar.

-- ---------------------------------------------------------------- workspaces
CREATE TABLE workspaces (
  id         TEXT NOT NULL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- `color` guarda o NOME DE UM SLOT da paleta, nunca um valor de cor. 'amber' é
-- o que `workspaceColorFor("Padrão")` devolve — as duas pontas precisam bater.
INSERT INTO workspaces (id, name, color, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'Padrão', 'amber', '1970-01-01T00:00:00.000Z');

-- ------------------------------------------------------------------ projects
ALTER TABLE projects RENAME TO projects_pre_011;

CREATE TABLE projects (
  id           TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  UNIQUE(workspace_id, name)
);

INSERT INTO projects (id, workspace_id, name)
SELECT id, '00000000-0000-4000-8000-000000000001', name FROM projects_pre_011;

-- ---------------------------------------------------------------- categories
ALTER TABLE categories RENAME TO categories_pre_011;

CREATE TABLE categories (
  id               TEXT    NOT NULL PRIMARY KEY,
  workspace_id     TEXT    NOT NULL REFERENCES workspaces(id),
  name             TEXT    NOT NULL,
  default_billable INTEGER NOT NULL DEFAULT 1,
  UNIQUE(workspace_id, name)
);

INSERT INTO categories (id, workspace_id, name, default_billable)
SELECT id, '00000000-0000-4000-8000-000000000001', name, default_billable FROM categories_pre_011;

-- --------------------------------------------------------------------- tasks
CREATE TABLE tasks_new (
  id               TEXT    NOT NULL PRIMARY KEY,
  workspace_id     TEXT    NOT NULL REFERENCES workspaces(id),
  name             TEXT,
  project_id       TEXT    REFERENCES projects(id) ON DELETE SET NULL,
  category_id      TEXT    REFERENCES categories(id) ON DELETE SET NULL,
  billable         INTEGER NOT NULL DEFAULT 1,
  start_time       TEXT    NOT NULL,
  end_time         TEXT,
  duration_seconds INTEGER,
  status           TEXT    NOT NULL DEFAULT 'running'
                           CHECK(status IN ('running','paused','completed')),
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  sent_to_sheets   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO tasks_new (id, workspace_id, name, project_id, category_id, billable,
                       start_time, end_time, duration_seconds, status,
                       created_at, updated_at, sent_to_sheets)
SELECT id, '00000000-0000-4000-8000-000000000001', name, project_id, category_id, billable,
       start_time, end_time, duration_seconds, status,
       created_at, updated_at, sent_to_sheets
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_status       ON tasks(status);
CREATE INDEX idx_tasks_start_time   ON tasks(start_time);
CREATE INDEX idx_tasks_workspace_id ON tasks(workspace_id);

-- ------------------------------------------------------------- planned_tasks
CREATE TABLE planned_tasks_new (
  id              TEXT    NOT NULL PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id),
  name            TEXT    NOT NULL,
  project_id      TEXT    REFERENCES projects(id) ON DELETE SET NULL,
  category_id     TEXT    REFERENCES categories(id) ON DELETE SET NULL,
  billable        INTEGER NOT NULL DEFAULT 1,
  schedule_type   TEXT    NOT NULL DEFAULT 'specific_date'
                          CHECK(schedule_type IN ('specific_date','recurring','period')),
  schedule_date   TEXT,
  recurring_days  TEXT,
  period_start    TEXT,
  period_end      TEXT,
  completed_dates TEXT    NOT NULL DEFAULT '[]',
  actions         TEXT    NOT NULL DEFAULT '[]',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL,
  start_time      TEXT,
  end_time        TEXT
);

INSERT INTO planned_tasks_new (id, workspace_id, name, project_id, category_id, billable,
                               schedule_type, schedule_date, recurring_days, period_start,
                               period_end, completed_dates, actions, sort_order, created_at,
                               start_time, end_time)
SELECT id, '00000000-0000-4000-8000-000000000001', name, project_id, category_id, billable,
       schedule_type, schedule_date, recurring_days, period_start,
       period_end, completed_dates, actions, sort_order, created_at,
       start_time, end_time
FROM planned_tasks;

DROP TABLE planned_tasks;
ALTER TABLE planned_tasks_new RENAME TO planned_tasks;

CREATE INDEX idx_planned_tasks_schedule_date ON planned_tasks(schedule_date);
CREATE INDEX idx_planned_tasks_schedule_type ON planned_tasks(schedule_type);
CREATE INDEX idx_planned_tasks_workspace_id  ON planned_tasks(workspace_id);

-- ----------------------------------------------------------- export_profiles
-- Reconstruída porque `ADD COLUMN ... REFERENCES ... NOT NULL DEFAULT x` é
-- proibido pelo SQLite ("Cannot add a REFERENCES column with non-NULL default
-- value") — verificado no spike.
CREATE TABLE export_profiles_new (
  id              TEXT    NOT NULL PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id),
  name            TEXT    NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,
  format          TEXT    NOT NULL DEFAULT 'csv'
                          CHECK(format IN ('csv','xlsx','json')),
  separator       TEXT    NOT NULL DEFAULT 'comma'
                          CHECK(separator IN ('comma','semicolon')),
  duration_format TEXT    NOT NULL DEFAULT 'hh:mm:ss'
                          CHECK(duration_format IN ('hh:mm:ss','decimal','minutes')),
  date_format     TEXT    NOT NULL DEFAULT 'iso'
                          CHECK(date_format IN ('iso','dd/mm/yyyy')),
  columns         TEXT    NOT NULL DEFAULT '[]'
);

INSERT INTO export_profiles_new (id, workspace_id, name, is_default, format, separator,
                                 duration_format, date_format, columns)
SELECT id, '00000000-0000-4000-8000-000000000001', name, is_default, format, separator,
       duration_format, date_format, columns
FROM export_profiles;

DROP TABLE export_profiles;
ALTER TABLE export_profiles_new RENAME TO export_profiles;

-- is_default passa a ser único por workspace, não global.
CREATE UNIQUE INDEX idx_export_profiles_default
  ON export_profiles(workspace_id) WHERE is_default = 1;

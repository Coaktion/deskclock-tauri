-- Estado de rastreamento de reuniões do Google Agenda para início/fim automático
-- de tarefas. A identidade do calendário (calendar_event_id) fica confinada a esta
-- tabela — as entidades núcleo (tasks/planned_tasks) permanecem agnósticas à integração.
CREATE TABLE IF NOT EXISTS calendar_tracked_meetings (
  calendar_event_id  TEXT PRIMARY KEY,
  date               TEXT NOT NULL,
  title              TEXT NOT NULL,
  start_iso          TEXT NOT NULL,
  end_iso            TEXT,
  started_task_id    TEXT,
  start_prompted_at  TEXT,
  start_dismissed    INTEGER NOT NULL DEFAULT 0,
  end_prompt_count   INTEGER NOT NULL DEFAULT 0,
  last_end_prompt_at TEXT,
  ended              INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_calendar_tracked_meetings_date
  ON calendar_tracked_meetings (date);

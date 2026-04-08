CREATE TABLE IF NOT EXISTS planned_tasks (
  id              TEXT    NOT NULL PRIMARY KEY,
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
  created_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planned_tasks_schedule_date  ON planned_tasks(schedule_date);
CREATE INDEX IF NOT EXISTS idx_planned_tasks_schedule_type  ON planned_tasks(schedule_type);

CREATE TABLE IF NOT EXISTS task_integration_log (
  task_id     TEXT NOT NULL,
  integration TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  PRIMARY KEY (task_id, integration)
);

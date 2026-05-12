-- Adiciona horários de início/fim ao PlannedTask para guardar o horário
-- original do evento do Google Agenda e permitir lançamento retroativo direto.
ALTER TABLE planned_tasks ADD COLUMN start_time TEXT;
ALTER TABLE planned_tasks ADD COLUMN end_time   TEXT;

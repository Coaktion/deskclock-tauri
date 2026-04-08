CREATE TABLE IF NOT EXISTS export_profiles (
  id              TEXT    NOT NULL PRIMARY KEY,
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

-- Perfil padrão pré-existente
INSERT OR IGNORE INTO export_profiles
  (id, name, is_default, format, separator, duration_format, date_format, columns)
VALUES (
  'default-export-profile',
  'Padrão',
  1,
  'csv',
  'comma',
  'hh:mm:ss',
  'iso',
  '[{"field":"name","label":"Nome","visible":true,"order":0},{"field":"project","label":"Projeto","visible":true,"order":1},{"field":"category","label":"Categoria","visible":true,"order":2},{"field":"billable","label":"Billable","visible":true,"order":3},{"field":"startTime","label":"Início","visible":true,"order":4},{"field":"endTime","label":"Fim","visible":true,"order":5},{"field":"durationSeconds","label":"Duração","visible":true,"order":6}]'
);

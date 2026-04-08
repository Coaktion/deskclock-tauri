PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id   TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS categories (
  id               TEXT    NOT NULL PRIMARY KEY,
  name             TEXT    NOT NULL UNIQUE,
  default_billable INTEGER NOT NULL DEFAULT 1
);

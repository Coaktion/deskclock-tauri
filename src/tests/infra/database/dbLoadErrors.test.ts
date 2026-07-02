import { describe, it, expect } from "vitest";
import { isRetriableDbLoadError } from "@infra/database/dbLoadErrors";

describe("isRetriableDbLoadError", () => {
  it("re-tenta erros de checksum de migration em estado parcial", () => {
    expect(isRetriableDbLoadError("migration 9 was previously applied")).toBe(true);
    expect(isRetriableDbLoadError("migration was previously applied but has been modified")).toBe(
      true
    );
  });

  it("re-tenta contenção de lock do SQLite", () => {
    expect(isRetriableDbLoadError("database is locked")).toBe(true);
    expect(isRetriableDbLoadError("database is busy")).toBe(true);
    expect(
      isRetriableDbLoadError("error returned from database: (code: 5) database is locked")
    ).toBe(true);
    expect(isRetriableDbLoadError("(code: 6) database table is locked")).toBe(true);
    expect(isRetriableDbLoadError("unable to open database file")).toBe(true);
  });

  it("reconhece os códigos SQLITE_BUSY/LOCKED isoladamente", () => {
    // Sem a substring "locked" — garante que o padrão (code: N) contribui sozinho.
    expect(isRetriableDbLoadError("error returned from database: (code: 5)")).toBe(true);
    expect(isRetriableDbLoadError("sqlite failure (code: 6)")).toBe(true);
  });

  it("é case-insensitive", () => {
    expect(isRetriableDbLoadError("DATABASE IS LOCKED")).toBe(true);
    expect(isRetriableDbLoadError("Has Been Modified")).toBe(true);
  });

  it("não re-tenta erros permanentes / não relacionados", () => {
    expect(isRetriableDbLoadError("no such table: calendar_tracked_meetings")).toBe(false);
    expect(isRetriableDbLoadError("syntax error near WHERE")).toBe(false);
    expect(isRetriableDbLoadError("")).toBe(false);
    expect(isRetriableDbLoadError("unique constraint failed")).toBe(false);
  });
});

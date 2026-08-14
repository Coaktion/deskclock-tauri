import { describe, it, expect } from "vitest";
import {
  shouldSyncMondayProjects,
  type MondayProjectsSyncState,
} from "@domain/usecases/monday/mondayProjectsSyncPolicy";

function makeState(overrides: Partial<MondayProjectsSyncState> = {}): MondayProjectsSyncState {
  return {
    apiKey: "key",
    portfolioBoardId: "90000000001",
    lastSyncDate: "2026-08-04",
    todayISO: "2026-08-05",
    ...overrides,
  };
}

describe("shouldSyncMondayProjects", () => {
  it("roda quando o dia virou desde a última releitura", () => {
    expect(shouldSyncMondayProjects(makeState())).toBe(true);
  });

  it("roda quando nunca rodou", () => {
    expect(shouldSyncMondayProjects(makeState({ lastSyncDate: "" }))).toBe(true);
  });

  it("não repete no mesmo dia", () => {
    // O tique é de 30 min só para perceber a virada; o trabalho é uma vez ao dia.
    expect(shouldSyncMondayProjects(makeState({ lastSyncDate: "2026-08-05" }))).toBe(false);
  });

  it("não roda sem chave de API nem sem board de Portfólio", () => {
    expect(shouldSyncMondayProjects(makeState({ apiKey: "" }))).toBe(false);
    expect(shouldSyncMondayProjects(makeState({ portfolioBoardId: "" }))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  isMondayLinkedWorkspace,
  shouldSyncMondayProjects,
  type MondayProjectsSyncState,
} from "@domain/usecases/monday/mondayProjectsSyncPolicy";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

function makeState(overrides: Partial<MondayProjectsSyncState> = {}): MondayProjectsSyncState {
  return {
    apiKey: "key",
    portfolioBoardId: "18418432045",
    lastSyncDate: "2026-08-04",
    todayISO: "2026-08-05",
    ...overrides,
  };
}

function makeMapping(overrides: Partial<MondayProjectMapping> = {}): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    portfolioItemId: "i1",
    mondayBoardId: "b1",
    mondayBoardName: "[BR] Cliente",
    scope: "cliente",
    activitiesGroupId: "group_activities",
    columnIds: {
      reportedHours: "numeric",
      activityType: "color",
      person: "person",
    },
    activityTypeLabels: [],
    projectStageLabels: [],
    projectStageTitle: "",
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

describe("isMondayLinkedWorkspace", () => {
  it("reconhece o workspace que já tem projeto vindo do Monday", () => {
    expect(isMondayLinkedWorkspace([makeMapping()], new Set(["p1"]))).toBe(true);
  });

  it("recusa o workspace onde o projeto do vínculo não existe", () => {
    // O caso que a guarda existe para impedir: estar num workspace pessoal na
    // virada do dia faria todos os boards da empresa nascerem lá dentro.
    expect(isMondayLinkedWorkspace([makeMapping()], new Set(["outro"]))).toBe(false);
  });

  it("recusa quando não há vínculo nenhum", () => {
    expect(isMondayLinkedWorkspace([], new Set(["p1"]))).toBe(false);
  });

  // O projeto conta mesmo sem quadro de destino: ele veio do Portfólio, e é isso
  // que prova que alguém trouxe o Monday para este workspace. Exigir o quadro
  // faria a varredura parar de rodar justamente onde ela preencheria a coluna.
  it("aceita projeto ainda sem quadro de destino", () => {
    const mapping = makeMapping({ mondayBoardId: "" });
    expect(isMondayLinkedWorkspace([mapping], new Set(["p1"]))).toBe(true);
  });
});

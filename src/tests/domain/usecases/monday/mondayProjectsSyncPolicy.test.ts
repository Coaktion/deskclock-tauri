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
    mondayWorkspaceId: "ws-monday",
    lastSyncDate: "2026-08-04",
    todayISO: "2026-08-05",
    ...overrides,
  };
}

function makeMapping(overrides: Partial<MondayProjectMapping> = {}): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    mondayBoardId: "b1",
    mondayBoardName: "[BR] Cliente",
    activitiesGroupId: "group_activities",
    columnIds: {
      reportedHours: "numeric",
      activityType: "color",
      person: "person",
    },
    activityTypeLabels: [],
    projectStageLabels: [],
    projectStageTitle: "",
    workspaceId: "ws-monday",
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

  it("não roda sem chave de API nem sem workspace do Monday", () => {
    expect(shouldSyncMondayProjects(makeState({ apiKey: "" }))).toBe(false);
    expect(shouldSyncMondayProjects(makeState({ mondayWorkspaceId: "" }))).toBe(false);
  });
});

describe("isMondayLinkedWorkspace", () => {
  it("reconhece o workspace que já tem projeto vindo deste workspace do Monday", () => {
    expect(isMondayLinkedWorkspace([makeMapping()], "ws-monday", new Set(["p1"]))).toBe(true);
  });

  it("recusa o workspace onde o projeto do vínculo não existe", () => {
    // O caso que a guarda existe para impedir: estar num workspace pessoal na
    // virada do dia faria todos os boards da empresa nascerem lá dentro.
    expect(isMondayLinkedWorkspace([makeMapping()], "ws-monday", new Set(["outro"]))).toBe(false);
  });

  it("ignora vínculo de outro workspace do Monday", () => {
    const mapping = makeMapping({ workspaceId: "ws-outra-conta" });
    expect(isMondayLinkedWorkspace([mapping], "ws-monday", new Set(["p1"]))).toBe(false);
  });

  it("recusa quando não há vínculo nenhum", () => {
    expect(isMondayLinkedWorkspace([], "ws-monday", new Set(["p1"]))).toBe(false);
  });
});

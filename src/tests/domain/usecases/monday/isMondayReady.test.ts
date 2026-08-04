import { describe, it, expect } from "vitest";
import { isMondayReady, type MondayReadinessConfig } from "@domain/usecases/monday/isMondayReady";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

const MONDAY_WS = "monday-ws";

function mapping(workspaceId = MONDAY_WS): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    mondayBoardId: "b1",
    mondayBoardName: "Cliente A",
    activitiesGroupId: "group_act",
    columnIds: {
      reportedHours: "numbers",
      billingType: "billing",
      activityType: "col_activity",
      projectStage: "col_stage",
      status: "status",
      person: "col_person",
    },
    activityTypeLabels: [],
    projectStageLabels: [],
    projectStageTitle: "Project Stage",
    workspaceId,
  };
}

function config(overrides: Partial<MondayReadinessConfig> = {}): MondayReadinessConfig {
  return {
    apiKey: "key",
    activeWorkspaceId: MONDAY_WS,
    projectMapping: [mapping()],
    internalBoardId: "b-interno",
    projectStageFieldId: "f-stage",
    ...overrides,
  };
}

describe("isMondayReady", () => {
  it("aceita a configuração completa", () => {
    expect(isMondayReady(config())).toBe(true);
  });

  it("recusa sem chave de API", () => {
    expect(isMondayReady(config({ apiKey: "" }))).toBe(false);
  });

  it("recusa sem board interno", () => {
    expect(isMondayReady(config({ internalBoardId: "" }))).toBe(false);
  });

  it("recusa sem campo de Project Stage", () => {
    expect(isMondayReady(config({ projectStageFieldId: "" }))).toBe(false);
  });

  it("recusa sem board mapeado", () => {
    expect(isMondayReady(config({ projectMapping: [] }))).toBe(false);
  });

  it("recusa mapeamento ausente na config", () => {
    expect(isMondayReady(config({ projectMapping: undefined }))).toBe(false);
  });

  it("recusa quando os boards mapeados são de outro workspace do Monday", () => {
    expect(isMondayReady(config({ projectMapping: [mapping("outro-ws")] }))).toBe(false);
  });

  it("aceita quando ao menos um board é do workspace ativo", () => {
    const mappings = [mapping("outro-ws"), mapping(MONDAY_WS)];
    expect(isMondayReady(config({ projectMapping: mappings }))).toBe(true);
  });

  it("não quebra com mapeamento gravado por versão anterior, sem os caches de rótulo", () => {
    const legacy = { ...mapping() } as Partial<MondayProjectMapping>;
    delete legacy.activityTypeLabels;
    delete legacy.projectStageLabels;
    delete legacy.projectStageTitle;

    expect(isMondayReady(config({ projectMapping: [legacy as MondayProjectMapping] }))).toBe(true);
  });
});

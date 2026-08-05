import { describe, it, expect } from "vitest";
import { isMondayReady, type MondayReadinessConfig } from "@domain/usecases/monday/isMondayReady";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

function mapping(overrides: Partial<MondayProjectMapping> = {}): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    portfolioItemId: "i1",
    mondayBoardId: "b1",
    mondayBoardName: "Cliente A",
    scope: "cliente",
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
    ...overrides,
  };
}

function config(overrides: Partial<MondayReadinessConfig> = {}): MondayReadinessConfig {
  return {
    apiKey: "key",
    portfolioBoardId: "18418432045",
    reportBoardId: "18422834169",
    projectMapping: [mapping()],
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

  it("recusa sem o board de Portfólio", () => {
    expect(isMondayReady(config({ portfolioBoardId: "" }))).toBe(false);
  });

  it("recusa sem o board de Report de Horas", () => {
    expect(isMondayReady(config({ reportBoardId: "" }))).toBe(false);
  });

  it("recusa sem projeto importado", () => {
    expect(isMondayReady(config({ projectMapping: [] }))).toBe(false);
  });

  it("recusa mapeamento ausente na config", () => {
    expect(isMondayReady(config({ projectMapping: undefined }))).toBe(false);
  });

  // Projeto sem quadro de destino existe de propósito — 14 dos 62 itens do
  // Portfólio estão assim. Mas as três ações do atalho abrem consultando boards:
  // sem nenhum, as três abrem vazias, que é justamente o que o atalho evita.
  it("recusa quando nenhum projeto tem quadro de destino", () => {
    expect(isMondayReady(config({ projectMapping: [mapping({ mondayBoardId: "" })] }))).toBe(false);
  });

  it("aceita quando ao menos um projeto tem quadro de destino", () => {
    const mappings = [mapping({ mondayBoardId: "" }), mapping()];
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

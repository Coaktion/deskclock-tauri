import { describe, it, expect } from "vitest";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

/** Como um vínculo gravado antes do cache de rótulos volta da config. */
const LEGACY = {
  deskclockProjectId: "p1",
  mondayBoardId: "b1",
  mondayBoardName: "[BR] Cliente Produto 01-999",
  activitiesGroupId: "g1",
  columnIds: {
    reportedHours: "num",
    billingType: "billing",
    activityType: "activity",
    status: "status",
    person: "person",
  },
} as MondayProjectMapping;

describe("normalizeProjectMappings", () => {
  it("preenche os rótulos ausentes de um mapeamento antigo", () => {
    const [mapping] = normalizeProjectMappings([LEGACY]);

    expect(mapping.activityTypeLabels).toEqual([]);
    expect(mapping.projectStageLabels).toEqual([]);
    expect(mapping.projectStageTitle).toBe("");
  });

  it("dá ao mapeamento antigo o Activities como destino de Activity", () => {
    // Sem isso, todo projeto vinculado antes do roteamento por Report Type
    // recusaria o `Activity` que é o padrão de toda tarefa — o envio pararia
    // inteiro até a próxima varredura de projetos.
    const [mapping] = normalizeProjectMappings([LEGACY]);

    expect(mapping.reportTypeGroupIds).toEqual({ Activity: "g1" });
    expect(mapping.nonBillableReasonLabels).toEqual([]);
  });

  it("não sobrescreve os grupos já resolvidos", () => {
    const [mapping] = normalizeProjectMappings([
      { ...LEGACY, reportTypeGroupIds: { Activity: "g1", Meeting: "g2" } },
    ]);

    expect(mapping.reportTypeGroupIds).toEqual({ Activity: "g1", Meeting: "g2" });
  });

  it("não sobrescreve os rótulos já cacheados", () => {
    const [mapping] = normalizeProjectMappings([
      { ...LEGACY, activityTypeLabels: ["Development"], projectStageTitle: "Etapa do projeto" },
    ]);

    expect(mapping.activityTypeLabels).toEqual(["Development"]);
    expect(mapping.projectStageTitle).toBe("Etapa do projeto");
  });

  it("assume cliente no mapeamento anterior ao escopo", () => {
    const [mapping] = normalizeProjectMappings([LEGACY]);

    expect(mapping.scope).toBe("cliente");
    expect(mapping.portfolioItemId).toBe("");
  });

  it("não sobrescreve o escopo já gravado", () => {
    const [mapping] = normalizeProjectMappings([{ ...LEGACY, scope: "interno" }]);

    expect(mapping.scope).toBe("interno");
  });

  it("aceita config ausente", () => {
    expect(normalizeProjectMappings(undefined)).toEqual([]);
  });
});

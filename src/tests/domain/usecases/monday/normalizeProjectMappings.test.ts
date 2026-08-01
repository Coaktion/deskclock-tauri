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
  workspaceId: "ws-monday",
} as MondayProjectMapping;

describe("normalizeProjectMappings", () => {
  it("preenche os rótulos ausentes de um mapeamento antigo", () => {
    const [mapping] = normalizeProjectMappings([LEGACY]);

    expect(mapping.activityTypeLabels).toEqual([]);
    expect(mapping.projectStageLabels).toEqual([]);
    expect(mapping.projectStageTitle).toBe("");
  });

  it("não sobrescreve os rótulos já cacheados", () => {
    const [mapping] = normalizeProjectMappings([
      { ...LEGACY, activityTypeLabels: ["Development"], projectStageTitle: "Etapa do projeto" },
    ]);

    expect(mapping.activityTypeLabels).toEqual(["Development"]);
    expect(mapping.projectStageTitle).toBe("Etapa do projeto");
  });

  it("aceita config ausente", () => {
    expect(normalizeProjectMappings(undefined)).toEqual([]);
  });
});

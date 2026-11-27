import { describe, it, expect } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import {
  catalogFieldHomonym,
  catalogFieldLabel,
  linkableCatalogFields,
  mergedCatalogOptionLabels,
  missingCatalogOptions,
  mondayCatalogFieldSource,
} from "@domain/usecases/monday/mondayCatalogFields";
import { EMPTY_FIELD_CATALOGS, type MondayProjectMapping } from "@shared/types/mondayConfig";

function field(overrides: Partial<CustomField>): CustomField {
  return {
    id: "f",
    label: "Project Stage",
    type: "select",
    options: [{ id: "o1", label: "Discovery" }],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const clientProject = {
  scope: "cliente",
  projectStageLabels: ["Build"],
  projectStageTitle: "Stage",
} as MondayProjectMapping;

describe("campos de catálogo do Monday", () => {
  it("etapa: catálogo mais a reserva de projeto de cliente, com o título do board", () => {
    const catalogs = { ...EMPTY_FIELD_CATALOGS, projectStage: ["Discovery"] };
    expect(mondayCatalogFieldSource("projectStage", catalogs, [clientProject])).toEqual({
      optionLabels: ["Discovery", "Build"],
      defaultFieldLabel: "Stage",
    });
    expect(mondayCatalogFieldSource("projectStage", EMPTY_FIELD_CATALOGS, [])).toEqual({
      optionLabels: [],
      defaultFieldLabel: "Project Stage",
    });
  });

  it("motivo: só o catálogo", () => {
    const catalogs = { ...EMPTY_FIELD_CATALOGS, nonBillableReason: ["Retrabalho"] };
    expect(mondayCatalogFieldSource("nonBillableReason", catalogs, [clientProject])).toEqual({
      optionLabels: ["Retrabalho"],
      defaultFieldLabel: "Non Billable reason",
    });
  });

  it("vinculáveis: select não arquivado, ou o já vinculado", () => {
    const fields = [
      field({ id: "a" }),
      field({ id: "b", archived: true }),
      field({ id: "c", type: "text" }),
    ];
    expect(linkableCatalogFields(fields, "").map((f) => f.id)).toEqual(["a"]);
    expect(linkableCatalogFields(fields, "b").map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("faltantes e a união mantêm as opções atuais na frente", () => {
    const f = field({});
    expect(missingCatalogOptions(f, ["Discovery", "Build"])).toEqual(["Build"]);
    expect(mergedCatalogOptionLabels(f, ["Build", "Discovery"])).toEqual(["Discovery", "Build"]);
  });

  it("homônimo select é reaproveitado; de outro tipo é erro", () => {
    expect(catalogFieldHomonym([field({})], "project stage")?.id).toBe("f");
    expect(catalogFieldHomonym([], "Project Stage")).toBeNull();
    expect(() => catalogFieldHomonym([field({ type: "text" })], "Project Stage")).toThrow(
      /não é de seleção/
    );
    expect(catalogFieldLabel("  ", "Título")).toBe("Título");
  });
});

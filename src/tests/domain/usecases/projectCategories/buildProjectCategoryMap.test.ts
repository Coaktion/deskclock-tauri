import { describe, it, expect } from "vitest";
import type { ProjectCategory, ProjectCategorySource } from "@domain/entities/ProjectCategory";
import { buildProjectCategoryMap } from "@domain/usecases/projectCategories/buildProjectCategoryMap";

function assoc(
  projectId: string,
  categoryId: string,
  source: ProjectCategorySource = "manual"
): ProjectCategory {
  return { projectId, categoryId, source, createdAt: "2026-08-06T12:00:00.000Z" };
}

describe("buildProjectCategoryMap", () => {
  it("agrupa as categorias por projeto", () => {
    const map = buildProjectCategoryMap([assoc("p1", "c1"), assoc("p1", "c2"), assoc("p2", "c3")]);
    expect(map.get("p1")).toEqual(new Set(["c1", "c2"]));
    expect(map.get("p2")).toEqual(new Set(["c3"]));
  });

  it("origem não separa nada — para o campo, manual e monday valem igual", () => {
    const map = buildProjectCategoryMap([assoc("p1", "c1", "monday"), assoc("p1", "c2", "manual")]);
    expect(map.get("p1")).toEqual(new Set(["c1", "c2"]));
  });

  it("projeto sem associação simplesmente não está no mapa — é o que devolve o catálogo inteiro", () => {
    const map = buildProjectCategoryMap([assoc("p1", "c1")]);
    expect(map.has("p2")).toBe(false);
  });

  it("lista vazia devolve mapa vazio", () => {
    expect(buildProjectCategoryMap([]).size).toBe(0);
  });
});

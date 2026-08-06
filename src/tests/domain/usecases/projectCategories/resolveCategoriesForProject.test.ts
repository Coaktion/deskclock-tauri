import { describe, it, expect } from "vitest";
import type { Category } from "@domain/entities/Category";
import { resolveCategoriesForProject } from "@domain/usecases/projectCategories/resolveCategoriesForProject";

function makeCategory(id: string, name = id): Category {
  return { id, workspaceId: "ws1", name, defaultBillable: true };
}

const catalog = [
  makeCategory("c1", "Desenvolvimento"),
  makeCategory("c2", "Reunião"),
  makeCategory("c3", "Suporte"),
];

describe("resolveCategoriesForProject", () => {
  it("conjunto vazio devolve o catálogo inteiro — é o que mantém o filtro duro seguro", () => {
    expect(resolveCategoriesForProject(catalog, new Set())).toEqual(catalog);
  });

  it("conjunto com itens deixa passar só as associadas", () => {
    const result = resolveCategoriesForProject(catalog, new Set(["c1", "c3"]));
    expect(result.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("id associado que já não existe no catálogo não inventa entrada", () => {
    const result = resolveCategoriesForProject(catalog, new Set(["c2", "apagada"]));
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("preserva a ordem do catálogo, não a de inserção do conjunto", () => {
    const result = resolveCategoriesForProject(catalog, new Set(["c3", "c1"]));
    expect(result.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("catálogo vazio devolve vazio, com ou sem associação", () => {
    expect(resolveCategoriesForProject([], new Set())).toEqual([]);
    expect(resolveCategoriesForProject([], new Set(["c1"]))).toEqual([]);
  });
});

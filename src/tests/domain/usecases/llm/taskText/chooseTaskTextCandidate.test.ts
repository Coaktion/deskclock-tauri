import { describe, it, expect } from "vitest";
import { chooseTaskTextCandidate } from "@domain/usecases/llm/taskText/chooseTaskTextCandidate";
import type {
  TaskTextAmbiguity,
  TaskTextInterpretation,
} from "@domain/usecases/llm/taskText/types";
import { makeCatalog } from "./fixtures";

function interpretation(over: Partial<TaskTextInterpretation> = {}): TaskTextInterpretation {
  return {
    name: "Daily",
    projectId: null,
    categoryId: null,
    billable: true,
    billableExplicit: false,
    customValues: {},
    ambiguities: [],
    notFound: [],
    source: "local",
    ...over,
  };
}

const PROJECT_AMBIGUITY: TaskTextAmbiguity = {
  key: "project",
  sigla: "P",
  label: "Projeto",
  query: "acme",
  candidates: [
    { id: "p-acme", label: "Acme Corp" },
    { id: "p-acmeb", label: "Acme Brasil" },
  ],
};

const CATEGORY_AMBIGUITY: TaskTextAmbiguity = {
  key: "category",
  sigla: "C",
  label: "Categoria",
  query: "m",
  candidates: [
    { id: "c-meet", label: "Meeting" },
    { id: "c-dev", label: "Development NB" },
  ],
};

describe("chooseTaskTextCandidate", () => {
  it("escolher o projeto resolve o campo e tira a ambiguidade", () => {
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [PROJECT_AMBIGUITY] }),
      "project",
      "p-acmeb",
      makeCatalog()
    );
    expect(result.projectId).toBe("p-acmeb");
    expect(result.ambiguities).toEqual([]);
  });

  it("ignora candidato que não estava na lista da ambiguidade", () => {
    const before = interpretation({ ambiguities: [PROJECT_AMBIGUITY] });
    expect(chooseTaskTextCandidate(before, "project", "p-tech", makeCatalog())).toBe(before);
  });

  it("trocar o projeto zera a categoria que ele não oferece, e o billable dela", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-acme", new Set(["c-meet"])]]) });
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [PROJECT_AMBIGUITY], categoryId: "c-dev", billable: false }),
      "project",
      "p-acme",
      catalog
    );
    expect(result.categoryId).toBeNull();
    expect(result.billable).toBe(true);
  });

  it("mantém a categoria que o projeto escolhido oferece", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-acme", new Set(["c-dev"])]]) });
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [PROJECT_AMBIGUITY], categoryId: "c-dev", billable: false }),
      "project",
      "p-acme",
      catalog
    );
    expect(result.categoryId).toBe("c-dev");
    expect(result.billable).toBe(false);
  });

  it("billable dito no texto sobrevive à categoria zerada", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-acme", new Set(["c-meet"])]]) });
    const result = chooseTaskTextCandidate(
      interpretation({
        ambiguities: [PROJECT_AMBIGUITY],
        categoryId: "c-dev",
        billable: false,
        billableExplicit: true,
      }),
      "project",
      "p-acme",
      catalog
    );
    expect(result.billable).toBe(false);
  });

  it("o projeto recorta a categoria ambígua; sobrando uma, ela é aplicada", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-acme", new Set(["c-dev"])]]) });
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [PROJECT_AMBIGUITY, CATEGORY_AMBIGUITY] }),
      "project",
      "p-acme",
      catalog
    );
    expect(result.categoryId).toBe("c-dev");
    expect(result.billable).toBe(false);
    expect(result.ambiguities).toEqual([]);
  });

  it("o projeto recorta a categoria ambígua; não sobrando nenhuma, vira não encontrada", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-acme", new Set(["c-sup"])]]) });
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [PROJECT_AMBIGUITY, CATEGORY_AMBIGUITY] }),
      "project",
      "p-acme",
      catalog
    );
    expect(result.ambiguities).toEqual([]);
    expect(result.notFound).toEqual([
      { key: "category", sigla: "C", label: "Categoria", query: "m" },
    ]);
  });

  it("o projeto recorta a categoria ambígua; sobrando duas ou mais, a ambiguidade fica só com elas", () => {
    const catalog = makeCatalog({
      projectCategoryMap: new Map([["p-acme", new Set(["c-meet", "c-dev"])]]),
    });
    const wide: TaskTextAmbiguity = {
      ...CATEGORY_AMBIGUITY,
      candidates: [...CATEGORY_AMBIGUITY.candidates, { id: "c-sup", label: "Suporte" }],
    };
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [PROJECT_AMBIGUITY, wide] }),
      "project",
      "p-acme",
      catalog
    );
    expect(result.projectId).toBe("p-acme");
    expect(result.categoryId).toBeNull();
    expect(result.notFound).toEqual([]);
    expect(result.ambiguities).toEqual([{ ...wide, candidates: CATEGORY_AMBIGUITY.candidates }]);
  });

  it("escolher a categoria aplica o billable padrão dela", () => {
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [CATEGORY_AMBIGUITY] }),
      "category",
      "c-dev",
      makeCatalog()
    );
    expect(result.categoryId).toBe("c-dev");
    expect(result.billable).toBe(false);
  });

  it("escolher a categoria não desfaz o billable dito no texto", () => {
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [CATEGORY_AMBIGUITY], billableExplicit: true }),
      "category",
      "c-dev",
      makeCatalog()
    );
    expect(result.billable).toBe(true);
  });

  it("campo personalizado grava o id da opção escolhida", () => {
    const stage: TaskTextAmbiguity = {
      key: "f-stage",
      sigla: "PS",
      label: "Project Stage",
      query: "d",
      candidates: [
        { id: "opt-dev", label: "Development" },
        { id: "opt-disc", label: "Discovery" },
      ],
    };
    const result = chooseTaskTextCandidate(
      interpretation({ ambiguities: [stage], customValues: { "f-reason": "opt-peer" } }),
      "f-stage",
      "opt-disc",
      makeCatalog()
    );
    expect(result.customValues).toEqual({ "f-reason": "opt-peer", "f-stage": "opt-disc" });
  });
});

import { describe, it, expect } from "vitest";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import { buildPreviewChips } from "@presentation/components/taskText/previewChips";
import { makeCatalog } from "../../../domain/usecases/llm/taskText/fixtures";

const catalog = makeCatalog();
const hints = buildTaskFieldHints(catalog.customFields, catalog);

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

describe("buildPreviewChips", () => {
  it("nome, projeto, categoria e billable sempre; campo personalizado só com valor", () => {
    const chips = buildPreviewChips(interpretation(), hints, catalog);
    expect(chips.map((c) => c.kind)).toEqual(["value", "empty", "empty", "billable"]);
  });

  it("mostra o nome do catálogo, e o rótulo da opção do select", () => {
    const chips = buildPreviewChips(
      interpretation({
        projectId: "p-tech",
        categoryId: "c-dev",
        customValues: { "f-stage": "opt-dev" },
      }),
      hints,
      catalog
    );
    const labels = chips.flatMap((c) => ("label" in c ? [c.label] : []));
    expect(labels).toEqual([
      "Daily",
      "Tech interno",
      "Development NB",
      "Project Stage: Development",
    ]);
  });

  it("sem nome, o chip do nome fica vazio", () => {
    expect(buildPreviewChips(interpretation({ name: null }), hints, catalog)[0]).toEqual({
      kind: "empty",
      key: "name",
      label: "Sem nome",
    });
  });

  it("ambíguo vira o chip que oferece os candidatos, no lugar do valor", () => {
    const candidates = [
      { id: "p-acme", label: "Acme Corp" },
      { id: "p-acmeb", label: "Acme Brasil" },
    ];
    const chips = buildPreviewChips(
      interpretation({
        ambiguities: [{ key: "project", sigla: "P", label: "Projeto", query: "acme", candidates }],
      }),
      hints,
      catalog
    );
    expect(chips[1]).toMatchObject({ kind: "ambiguous", label: "acme", candidates });
  });

  it("não encontrado substitui o valor; no billable, vem ao lado do chip", () => {
    const chips = buildPreviewChips(
      interpretation({
        notFound: [
          { key: "category", sigla: "C", label: "Categoria", query: "xyz" },
          { key: "billable", sigla: "B", label: "Billable", query: "talvez" },
        ],
      }),
      hints,
      catalog
    );
    expect(chips.map((c) => c.kind)).toEqual([
      "value",
      "empty",
      "notFound",
      "billable",
      "notFound",
    ]);
    expect(chips[2]).toMatchObject({ label: "Categoria", query: "xyz" });
  });
});

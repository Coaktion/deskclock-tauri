import { describe, it, expect } from "vitest";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { formatTaskFieldInstruction } from "@domain/usecases/llm/taskText/formatTaskFieldInstruction";
import { REASON_FIELD, STAGE_FIELD, customField, makeCatalog } from "./fixtures";

function siglas(labels: string[]): string[] {
  const fields = labels.map((label, i) => customField({ id: `f${i}`, label, sortOrder: i }));
  return buildTaskFieldHints(fields, makeCatalog()).map((h) => h.sigla);
}

describe("buildTaskFieldHints", () => {
  it("começa pelos três fixos com exemplos do catálogo", () => {
    const [p, c, b] = buildTaskFieldHints([], makeCatalog());
    expect(p).toMatchObject({
      key: "project",
      sigla: "P",
      label: "Projeto",
      example: "Tech interno",
    });
    expect(c).toMatchObject({ key: "category", sigla: "C", example: "Development NB" });
    expect(b).toMatchObject({ key: "billable", sigla: "B", kind: "billable", example: "nb" });
  });

  it("deriva a sigla das iniciais e usa a primeira opção como exemplo do select", () => {
    const hints = buildTaskFieldHints([REASON_FIELD, STAGE_FIELD], makeCatalog());
    expect(hints.slice(3)).toEqual([
      {
        key: "f-stage",
        sigla: "PS",
        label: "Project Stage",
        kind: "select",
        fieldId: "f-stage",
        example: "Development",
      },
      {
        key: "f-reason",
        sigla: "NBR",
        label: "Non Billable reason",
        kind: "select",
        fieldId: "f-reason",
        example: "Peer technical",
      },
    ]);
  });

  it("deixa de fora o campo arquivado", () => {
    const archived = customField({ id: "old", label: "Antigo", archived: true });
    expect(buildTaskFieldHints([archived], makeCatalog())).toHaveLength(3);
  });

  it("nunca colide com P, C ou B: estende com as letras da última palavra", () => {
    expect(siglas(["Prioridade", "Cliente", "Bloco"]).slice(3)).toEqual(["PR", "CL", "BL"]);
  });

  it("desempata colisões entre campos de forma determinística", () => {
    expect(siglas(["Project Stage", "Peer Stage", "Pre Sale"]).slice(3)).toEqual([
      "PS",
      "PST",
      "PSA",
    ]);
  });

  it("recorre a número quando as letras acabam", () => {
    expect(siglas(["P", "P"]).slice(3)).toEqual(["P2", "P3"]);
  });

  it("ignora acentos ao derivar a sigla", () => {
    expect(siglas(["Área técnica"]).slice(3)).toEqual(["AT"]);
  });

  it("omite o exemplo quando o catálogo está vazio", () => {
    const [p] = buildTaskFieldHints([], makeCatalog({ projects: [] }));
    expect(p).not.toHaveProperty("example");
  });
});

describe("formatTaskFieldInstruction", () => {
  it("lista o nome e os rótulos na ordem, com um exemplo do catálogo", () => {
    const hints = buildTaskFieldHints([STAGE_FIELD, REASON_FIELD], makeCatalog());
    expect(formatTaskFieldInstruction(hints)).toBe(
      "Nome, Projeto, Categoria, Billable, Project Stage, Non Billable reason, nessa ordem e por " +
        "vírgula; dá para pular campo. Ex.: Revisão, Tech interno, Development NB, nb, Development, " +
        "Peer technical"
    );
  });

  it("o exemplo pula o campo que não tem um", () => {
    const text = customField({ id: "t", label: "Ticket", sortOrder: 1 });
    const hints = buildTaskFieldHints([text], makeCatalog({ projects: [] }));
    expect(formatTaskFieldInstruction(hints)).toBe(
      "Nome, Projeto, Categoria, Billable, Ticket, nessa ordem e por vírgula; dá para pular campo. " +
        "Ex.: Revisão, Development NB, nb"
    );
  });

  it("sem nenhum exemplo, omite o Ex.", () => {
    expect(
      formatTaskFieldInstruction([
        { key: "t", sigla: "T", label: "Ticket", kind: "text", fieldId: "t" },
      ])
    ).toBe("Nome, Ticket, nessa ordem e por vírgula; dá para pular campo.");
  });

  it("devolve vazio sem campos", () => {
    expect(formatTaskFieldInstruction([])).toBe("");
  });
});

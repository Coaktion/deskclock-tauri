import { describe, it, expect } from "vitest";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { parseOrderedText } from "@domain/usecases/llm/taskText/parseOrderedText";
import { resolveTaskFields } from "@domain/usecases/llm/taskText/resolveTaskFields";
import type { TaskTextCatalog } from "@domain/usecases/llm/taskText/types";
import { category, customField, project } from "./fixtures";

const STAGE = customField({
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  sortOrder: 1,
  options: [
    { id: "opt-dev", label: "Development" },
    { id: "opt-mig", label: "Migration" },
    { id: "opt-close", label: "Closure" },
  ],
});

const REASON = customField({
  id: "f-reason",
  label: "Non Billable reason",
  type: "select",
  sortOrder: 2,
  options: [{ id: "opt-peer", label: "Peer Technical Support" }],
});

const TICKET = customField({ id: "f-ticket", label: "Ticket", type: "text", sortOrder: 3 });

function makeOrderedCatalog(overrides: Partial<TaskTextCatalog> = {}): TaskTextCatalog {
  return {
    projects: [
      project("p-ptg", "[US] Pinecrest Travel Group Zendesk, Migration 60-1"),
      project("p-cx", "CX Atividades Internas"),
    ],
    categories: [
      category("c-dev", "Development"),
      category("c-1on1", "1:1 / PDI / Avaliações", false),
    ],
    projectCategoryMap: new Map(),
    customFields: [STAGE, REASON, TICKET],
    ...overrides,
  };
}

const catalog = makeOrderedCatalog();
const hints = buildTaskFieldHints(catalog.customFields, catalog);

function interpret(text: string, c: TaskTextCatalog = catalog) {
  const h = buildTaskFieldHints(c.customFields, c);
  const parsed = parseOrderedText(text, h, c);
  return parsed && resolveTaskFields(parsed, h, c, "local");
}

describe("parseOrderedText", () => {
  it("lê nome e campos pela posição; a ordem decide que Development é Categoria", () => {
    const text =
      "Migration Service - Northwind JSM, Pinecrest Travel Group, Development, Migration";
    expect(parseOrderedText(text, hints, catalog)).toEqual({
      name: "Migration Service - Northwind JSM",
      fields: { P: "Pinecrest Travel Group", C: "Development", PS: "Migration" },
    });
    expect(interpret(text)).toMatchObject({
      name: "Migration Service - Northwind JSM",
      projectId: "p-ptg",
      categoryId: "c-dev",
      billable: true,
      billableExplicit: false,
      customValues: { [STAGE.id]: "opt-mig" },
      notFound: [],
    });
  });

  it("aceita billable explícito na posição e todos os campos", () => {
    expect(
      interpret("Revisão, CX Atividades Internas, 1:1, nb, Closure, Peer Technical Support")
    ).toMatchObject({
      name: "Revisão",
      projectId: "p-cx",
      categoryId: "c-1on1",
      billable: false,
      billableExplicit: true,
      customValues: { [STAGE.id]: "opt-close", [REASON.id]: "opt-peer" },
    });
  });

  it("pula o projeto quando o primeiro trecho é uma categoria", () => {
    expect(parseOrderedText("Revisão; Development; Migration", hints, catalog)).toEqual({
      name: "Revisão",
      fields: { C: "Development", PS: "Migration" },
    });
  });

  it("recorta a categoria pelo projeto resolvido", () => {
    const scoped = makeOrderedCatalog({
      projectCategoryMap: new Map([["p-cx", new Set(["c-1on1"])]]),
    });
    // Development não está no recorte do CX, então cai no Project Stage.
    expect(parseOrderedText("Revisão, CX Atividades, Development", hints, scoped)).toEqual({
      name: "Revisão",
      fields: { P: "CX Atividades", PS: "Development" },
    });
  });

  it("trecho que nada reconhece fica no campo da vez e aparece como não encontrado", () => {
    const noText = makeOrderedCatalog({ customFields: [STAGE, REASON] });
    expect(interpret("Revisão, Pinecrest Travel Group, Inexistente", noText)).toMatchObject({
      projectId: "p-ptg",
      categoryId: null,
      notFound: [{ key: "category", query: "Inexistente" }],
    });
  });

  it("campo de texto se preenche na própria posição", () => {
    expect(
      interpret("Revisão, Pinecrest Travel Group, Development, nb, Closure, Peer, #4521")
    ).toMatchObject({
      projectId: "p-ptg",
      customValues: { [TICKET.id]: "#4521" },
      notFound: [],
    });
  });

  it("erro de digitação não salta até o campo de texto nem descarta o que vem depois", () => {
    expect(parseOrderedText("Revisão, Pinecrest, Typo, nb, Development", hints, catalog)).toEqual({
      name: "Revisão",
      fields: { P: "Pinecrest", C: "Typo", B: "nb", PS: "Development" },
    });
  });

  it("ignora trechos além do último campo", () => {
    expect(
      parseOrderedText("Revisão, Peer Technical Support, sobra, mais", hints, catalog)
    ).toEqual({ name: "Revisão", fields: { NBR: "Peer Technical Support", T: "sobra" } });
  });

  it("texto livre com vírgula devolve null, mesmo com campo de texto", () => {
    expect(parseOrderedText("Reunião com o time, sobre a sprint", hints, catalog)).toBeNull();
  });

  it("um trecho só devolve null", () => {
    expect(parseOrderedText("Revisão, ", hints, catalog)).toBeNull();
    expect(parseOrderedText("Revisão", hints, catalog)).toBeNull();
  });

  it("nb vai para o Billable mesmo com categoria que tem NB no nome", () => {
    const c = makeOrderedCatalog({
      categories: [category("c-devnb", "Development NB"), category("c-dev", "Development")],
    });
    const result = interpret("Daily, nb", c);
    expect(result?.billable).toBe(false);
    expect(result?.billableExplicit).toBe(true);
    expect(result?.categoryId).toBeNull();
    expect(result?.ambiguities).toEqual([]);
  });

  it("casamento só por fuzzy não prova o campo: o trecho fica no campo da vez", () => {
    // "pgz" é subsequência de "Pinecrest travel Group Zendesk", mas não é prefixo de palavra.
    expect(parseOrderedText("Daily, pgz", hints, catalog)).toBeNull();
  });

  it("sim/não vai para o checkbox depois do Billable", () => {
    const remote = customField({ id: "f-remote", label: "Remoto", type: "checkbox", sortOrder: 4 });
    const c = makeOrderedCatalog({ customFields: [STAGE, remote] });
    const h = buildTaskFieldHints(c.customFields, c);
    expect(parseOrderedText("Daily, nb, sim", h, c)).toEqual({
      name: "Daily",
      fields: { B: "nb", R: "sim" },
    });
    expect(parseOrderedText("Daily, Closure, nao", h, c)).toEqual({
      name: "Daily",
      fields: { PS: "Closure", R: "nao" },
    });
  });

  it("campo select sem o campo no catálogo não reconhece nada", () => {
    const orphan = buildTaskFieldHints([STAGE], makeOrderedCatalog());
    const c = makeOrderedCatalog({ customFields: [] });
    expect(parseOrderedText("Daily, Closure", orphan, c)).toBeNull();
  });
});

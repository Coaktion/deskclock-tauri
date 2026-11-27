import { describe, it, expect } from "vitest";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { resolveTaskFields } from "@domain/usecases/llm/taskText/resolveTaskFields";
import type { TaskTextCatalog } from "@domain/usecases/llm/taskText/types";
import { REASON_FIELD, STAGE_FIELD, category, customField, makeCatalog } from "./fixtures";

const CHECK_FIELD = customField({
  id: "f-check",
  label: "Hora extra",
  type: "checkbox",
  sortOrder: 3,
});
const TEXT_FIELD = customField({ id: "f-ticket", label: "Ticket", type: "text", sortOrder: 4 });

function resolve(fields: Record<string, string>, catalog: TaskTextCatalog = makeCatalog()) {
  const all = { ...catalog, customFields: [...catalog.customFields, CHECK_FIELD, TEXT_FIELD] };
  const hints = buildTaskFieldHints(all.customFields, all);
  return resolveTaskFields({ name: " Daily ", fields }, hints, all, "local");
}

describe("resolveTaskFields", () => {
  it("resolve pelo nome exato, ignorando caixa e espaços", () => {
    const result = resolve({ P: "  tech   INTERNO " });
    expect(result.projectId).toBe("p-tech");
    expect(result.name).toBe("Daily");
    expect(result.source).toBe("local");
  });

  it("resolve por prefixo de palavras", () => {
    expect(resolve({ P: "tech int" }).projectId).toBe("p-tech");
  });

  it("ignora acentos", () => {
    expect(resolve({ P: "sao paulo" }).projectId).toBe("p-sao");
  });

  it("o exato vence o prefixo de outros", () => {
    const catalog = makeCatalog({
      categories: [category("c1", "Dev"), category("c2", "Dev ops"), category("c3", "Devolução")],
    });
    expect(resolve({ C: "dev" }, catalog).categoryId).toBe("c1");
  });

  it("marca ambíguo com os candidatos do melhor nível", () => {
    const result = resolve({ P: "acme" });
    expect(result.projectId).toBeNull();
    expect(result.ambiguities).toEqual([
      {
        key: "project",
        sigla: "P",
        label: "Projeto",
        query: "acme",
        candidates: [
          { id: "p-acme", label: "Acme Corp" },
          { id: "p-acmeb", label: "Acme Brasil" },
        ],
      },
    ]);
  });

  it("limita os candidatos ambíguos a cinco", () => {
    const categories = Array.from({ length: 7 }, (_, i) => category(`c${i}`, `Reunião ${i}`));
    const result = resolve({ C: "reuniao" }, makeCatalog({ categories }));
    expect(result.ambiguities[0].candidates).toHaveLength(5);
  });

  it("marca não encontrado", () => {
    const result = resolve({ P: "zzz" });
    expect(result.projectId).toBeNull();
    expect(result.notFound).toEqual([
      { key: "project", sigla: "P", label: "Projeto", query: "zzz" },
    ]);
  });

  it("procura a categoria só nas associadas ao projeto resolvido", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-tech", new Set(["c-meet"])]]) });
    expect(resolve({ P: "tech", C: "suporte" }, catalog).categoryId).toBeNull();
    expect(resolve({ P: "tech", C: "meet" }, catalog).categoryId).toBe("c-meet");
  });

  it("projeto sem associação oferece o catálogo inteiro", () => {
    const catalog = makeCatalog({ projectCategoryMap: new Map([["p-acme", new Set(["c-meet"])]]) });
    expect(resolve({ P: "tech", C: "suporte" }, catalog).categoryId).toBe("c-sup");
  });

  it("billable ausente segue o default da categoria", () => {
    const result = resolve({ C: "development" });
    expect(result.billable).toBe(false);
    expect(result.billableExplicit).toBe(false);
  });

  it("billable ausente e sem categoria é true", () => {
    expect(resolve({}).billable).toBe(true);
  });

  it("billable explícito vence o default da categoria", () => {
    const result = resolve({ C: "development", B: "b" });
    expect(result.billable).toBe(true);
    expect(result.billableExplicit).toBe(true);
    expect(resolve({ B: "Não" }).billable).toBe(false);
    expect(resolve({ B: "non-billable" }).billable).toBe(false);
  });

  it("billable ilegível vira não encontrado e cai no default", () => {
    const result = resolve({ B: "talvez" });
    expect(result.billable).toBe(true);
    expect(result.billableExplicit).toBe(false);
    expect(result.notFound.map((n) => n.sigla)).toEqual(["B"]);
  });

  it("select grava o id da opção", () => {
    const result = resolve({ PS: "dev", NBR: "peer" });
    expect(result.customValues).toEqual({
      [STAGE_FIELD.id]: "opt-dev",
      [REASON_FIELD.id]: "opt-peer",
    });
  });

  it("checkbox marcado grava '1' e desmarcado fica ausente", () => {
    const hints = buildTaskFieldHints([CHECK_FIELD], makeCatalog());
    const sigla = hints[3].sigla;
    expect(resolve({ [sigla]: "sim" }).customValues).toEqual({ "f-check": "1" });
    expect(resolve({ [sigla]: "não" }).customValues).toEqual({});
  });

  it("checkbox ilegível vira não encontrado e não grava valor", () => {
    const hints = buildTaskFieldHints([CHECK_FIELD], makeCatalog());
    const sigla = hints[3].sigla;
    const result = resolve({ [sigla]: "talvez" });
    expect(result.customValues).toEqual({});
    expect(result.notFound).toEqual([
      { key: "f-check", sigla, label: "Hora extra", query: "talvez" },
    ]);
  });

  it("texto grava o valor cru, aparado", () => {
    expect(resolve({ T: "  #1234  " }).customValues).toEqual({ "f-ticket": "#1234" });
  });

  it("nome vazio vira null", () => {
    const hints = buildTaskFieldHints([], makeCatalog());
    expect(
      resolveTaskFields({ name: "  ", fields: {} }, hints, makeCatalog(), "llm").name
    ).toBeNull();
  });
});

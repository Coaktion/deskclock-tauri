import { describe, it, expect } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import { normalizeCustomValues } from "@domain/usecases/customFields/normalizeCustomValues";
import { DomainError } from "@shared/errors";

function field(overrides: Partial<CustomField> & Pick<CustomField, "id" | "type">): CustomField {
  return {
    label: overrides.id,
    options: [],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const fields: CustomField[] = [
  field({ id: "f-text", type: "text" }),
  field({ id: "f-multi", type: "multiline" }),
  field({
    id: "f-select",
    type: "select",
    label: "Fase",
    options: [
      { id: "o-1", label: "Análise" },
      { id: "o-2", label: "Entrega" },
    ],
  }),
  field({ id: "f-check", type: "checkbox" }),
  field({ id: "f-old", type: "text", archived: true }),
];

describe("normalizeCustomValues", () => {
  it("devolve mapa vazio para entrada vazia", () => {
    expect(normalizeCustomValues({}, fields)).toEqual({});
  });

  it("rejeita id de campo desconhecido citando o id", () => {
    expect(() => normalizeCustomValues({ "f-x": "a" }, fields)).toThrow(DomainError);
    expect(() => normalizeCustomValues({ "f-x": "a" }, fields)).toThrow(/f-x/);
  });

  it("aceita campo arquivado", () => {
    expect(normalizeCustomValues({ "f-old": "valor" }, fields)).toEqual({ "f-old": "valor" });
  });

  it("apara text colapsando espaços e multiline preservando quebras", () => {
    expect(normalizeCustomValues({ "f-text": "  a   b ", "f-multi": " a\n b \n" }, fields)).toEqual(
      { "f-text": "a b", "f-multi": "a\n b" }
    );
  });

  it("trata text vazio como ausência", () => {
    expect(normalizeCustomValues({ "f-text": "   " }, fields)).toEqual({});
  });

  it("select aceita o id da opção", () => {
    expect(normalizeCustomValues({ "f-select": "o-2" }, fields)).toEqual({ "f-select": "o-2" });
  });

  it("select aceita o rótulo, aparado e sem diferenciar caixa", () => {
    expect(normalizeCustomValues({ "f-select": "  ANÁLISE " }, fields)).toEqual({
      "f-select": "o-1",
    });
  });

  it("select vazio é ausência", () => {
    expect(normalizeCustomValues({ "f-select": " " }, fields)).toEqual({});
  });

  it("select inválido cita campo e opções válidas", () => {
    const run = () => normalizeCustomValues({ "f-select": "Teste" }, fields);
    expect(run).toThrow(DomainError);
    expect(run).toThrow(/Fase/);
    expect(run).toThrow(/Análise/);
    expect(run).toThrow(/Entrega/);
  });

  it.each(["1", "true", "TRUE", "Sim", " sim "])("checkbox %j marca", (value) => {
    expect(normalizeCustomValues({ "f-check": value }, fields)).toEqual({ "f-check": "1" });
  });

  it.each(["", "false", "0", "Não", "nao", "FALSE"])("checkbox %j é ausência", (value) => {
    expect(normalizeCustomValues({ "f-check": value }, fields)).toEqual({});
  });

  it("checkbox com valor irreconhecível é rejeitado citando o campo", () => {
    expect(() => normalizeCustomValues({ "f-check": "talvez" }, fields)).toThrow(/f-check/);
  });

  it("não muta a entrada", () => {
    const input = { "f-select": "Entrega" };
    normalizeCustomValues(input, fields);
    expect(input).toEqual({ "f-select": "Entrega" });
  });
});

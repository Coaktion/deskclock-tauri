import { describe, it, expect } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import { countFilledCustomValues } from "@domain/usecases/customFields/countFilledCustomValues";

function makeField(id: string, overrides: Partial<CustomField> = {}): CustomField {
  return {
    id,
    label: id,
    type: "text",
    options: [],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-08-06T12:00:00.000Z",
    ...overrides,
  };
}

describe("countFilledCustomValues", () => {
  it("conta só os campos com valor", () => {
    const fields = [makeField("a"), makeField("b"), makeField("c")];
    expect(countFilledCustomValues(fields, { a: "Fase 1", c: "algo" })).toBe(2);
  });

  it("trata ausente e string vazia como o mesmo 'sem valor'", () => {
    const fields = [makeField("a"), makeField("b")];
    expect(countFilledCustomValues(fields, { a: "" })).toBe(0);
  });

  it("ignora valor de campo que não está na lista ativa", () => {
    const fields = [makeField("a")];
    expect(countFilledCustomValues(fields, { a: "x", arquivado: "y" })).toBe(1);
  });

  it("checkbox desmarcado não conta — ele grava string vazia", () => {
    const fields = [makeField("flag", { type: "checkbox" })];
    expect(countFilledCustomValues(fields, { flag: "" })).toBe(0);
    expect(countFilledCustomValues(fields, { flag: "1" })).toBe(1);
  });

  it("sem campos ativos, não há o que contar", () => {
    expect(countFilledCustomValues([], { a: "x" })).toBe(0);
  });
});

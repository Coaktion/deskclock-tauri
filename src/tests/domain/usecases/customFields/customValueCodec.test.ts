import { describe, it, expect } from "vitest";
import {
  serializeCustomValue,
  formatCustomValue,
} from "@domain/usecases/customFields/customValueCodec";
import type { CustomField } from "@domain/entities/CustomField";

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "f1",
    label: "Project Stage",
    type: "text",
    options: [],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

const select = makeField({
  id: "f-stage",
  type: "select",
  options: [
    { id: "o1", label: "Discovery" },
    { id: "o2", label: "Delivery" },
  ],
});

const checkbox = makeField({ id: "f-check", type: "checkbox" });

describe("serializeCustomValue", () => {
  it("grava checkbox desmarcado como ausência de valor, não como zero", () => {
    // Se gravasse "0", uma tarefa em que o usuário marcou e desmarcou a caixa
    // deixaria de agrupar com uma em que ele nunca a tocou.
    expect(serializeCustomValue(checkbox, true)).toBe("1");
    expect(serializeCustomValue(checkbox, false)).toBe("");
    expect(serializeCustomValue(checkbox, "1")).toBe("1");
    expect(serializeCustomValue(checkbox, "")).toBe("");
  });

  it("aceita apenas ids de opção existentes no select", () => {
    expect(serializeCustomValue(select, "o2")).toBe("o2");
    expect(serializeCustomValue(select, "Delivery")).toBe("");
    expect(serializeCustomValue(select, "o9")).toBe("");
  });

  it("colapsa espaços em text mas preserva quebras em multiline", () => {
    expect(serializeCustomValue(makeField(), "  a   b  ")).toBe("a b");
    expect(serializeCustomValue(makeField({ type: "multiline" }), "  a\n  b  ")).toBe("a\n  b");
  });
});

describe("formatCustomValue", () => {
  it("resolve o label da opção do select", () => {
    expect(formatCustomValue(select, "o1")).toBe("Discovery");
    expect(formatCustomValue(select, "some-id-apagado")).toBe("");
  });

  it("traduz checkbox para Sim/Não", () => {
    expect(formatCustomValue(checkbox, "1")).toBe("Sim");
    expect(formatCustomValue(checkbox, "0")).toBe("Não");
  });
});

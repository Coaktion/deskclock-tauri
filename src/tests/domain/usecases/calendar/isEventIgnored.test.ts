import { describe, it, expect } from "vitest";
import {
  addIgnoreRule,
  isEventIgnored,
  removeIgnoreRule,
} from "@domain/usecases/calendar/isEventIgnored";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";

describe("isEventIgnored", () => {
  it("sem regras, nada é ignorado", () => {
    expect(isEventIgnored("Daily", [])).toBe(false);
  });

  it("'equals' casa o nome inteiro, sem caixa nem espaço nas pontas", () => {
    const rules: CalendarIgnoreRule[] = [{ operator: "equals", value: "  Lembrete " }];
    expect(isEventIgnored("LEMBRETE", rules)).toBe(true);
    expect(isEventIgnored("Lembrete semanal", rules)).toBe(false);
  });

  it("'contains' casa trecho do nome, sem caixa", () => {
    const rules: CalendarIgnoreRule[] = [{ operator: "contains", value: "lembrete" }];
    expect(isEventIgnored("Pagar conta — LEMBRETE", rules)).toBe(true);
    expect(isEventIgnored("Daily", rules)).toBe(false);
  });

  it("regra em branco nunca casa, nem com 'contains'", () => {
    const rules: CalendarIgnoreRule[] = [
      { operator: "contains", value: "   " },
      { operator: "equals", value: "" },
    ];
    expect(isEventIgnored("Daily", rules)).toBe(false);
    expect(isEventIgnored("", rules)).toBe(false);
  });

  it("basta uma regra casar", () => {
    const rules: CalendarIgnoreRule[] = [
      { operator: "equals", value: "Outro" },
      { operator: "contains", value: "ail" },
    ];
    expect(isEventIgnored("Daily", rules)).toBe(true);
  });
});

describe("addIgnoreRule", () => {
  it("soma a regra com o valor aparado", () => {
    expect(addIgnoreRule([], { operator: "equals", value: "  Daily " })).toEqual([
      { operator: "equals", value: "Daily" },
    ]);
  });

  it("não repete regra de mesmo operador e valor normalizado", () => {
    const rules: CalendarIgnoreRule[] = [{ operator: "equals", value: "Daily" }];
    expect(addIgnoreRule(rules, { operator: "equals", value: "DAILY " })).toBe(rules);
  });

  it("mesmo valor com outro operador é outra regra", () => {
    const rules: CalendarIgnoreRule[] = [{ operator: "equals", value: "Daily" }];
    expect(addIgnoreRule(rules, { operator: "contains", value: "Daily" })).toHaveLength(2);
  });

  it("valor em branco não entra", () => {
    const rules: CalendarIgnoreRule[] = [];
    expect(addIgnoreRule(rules, { operator: "contains", value: "  " })).toBe(rules);
  });
});

describe("removeIgnoreRule", () => {
  const rules: CalendarIgnoreRule[] = [
    { operator: "equals", value: "Daily" },
    { operator: "contains", value: "Almoço" },
  ];

  it("tira pela mesma igualdade do add: operador e valor normalizado", () => {
    expect(removeIgnoreRule(rules, { operator: "equals", value: "  daily " })).toEqual([
      { operator: "contains", value: "Almoço" },
    ]);
  });

  it("operador diferente não casa, e a lista volta a mesma", () => {
    expect(removeIgnoreRule(rules, { operator: "contains", value: "Daily" })).toBe(rules);
  });
});

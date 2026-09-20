import { effectiveWeekStart, isWeekendDay, weekSpan, weekdayOptions } from "@shared/utils/weekdays";
import { describe, expect, it } from "vitest";

const labels = (showWeekend: boolean, weekStartsOn: 0 | 1) =>
  weekdayOptions(showWeekend, weekStartsOn).map((d) => d.label);

describe("weekdayOptions", () => {
  it("oferece só os dias úteis com o fim de semana desligado", () => {
    expect(labels(false, 1)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex"]);
  });

  it("desligado, a escolha do primeiro dia não muda nada", () => {
    // Rodar a lista e depois tirar sábado e domingo devolve segunda a sexta nos
    // dois modos: escolher domingo não tem o que ordenar numa semana sem ele.
    expect(labels(false, 0)).toEqual(labels(false, 1));
  });

  it("ligado, segue o primeiro dia da semana escolhido", () => {
    // É a mesma semana que as pílulas do Planejamento desenham. Duas ordens na
    // mesma tela fariam a lista de dias parecer duas semanas diferentes.
    expect(labels(true, 1)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(labels(true, 0)).toEqual(["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]);
  });

  it("usa a escala do Date, e não o índice do array", () => {
    // É o que protege `recurringDays`: os valores gravados estão nessa escala, e
    // reindexar para 0..4 mudaria o dia de toda tarefa recorrente já salva.
    // Domingo é 0, então a lista não sai em ordem crescente em nenhum dos modos.
    expect(weekdayOptions(false, 1).map((d) => d.value)).toEqual([1, 2, 3, 4, 5]);
    expect(weekdayOptions(true, 1).map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOptions(true, 0).map((d) => d.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("dá nome por extenso a todo dia oferecido", () => {
    expect(weekdayOptions(true, 1).every((d) => d.title.length > d.label.length)).toBe(true);
  });
});

describe("weekSpan", () => {
  it("conta os dias corridos da semana, não as opções oferecidas", () => {
    expect(weekSpan(false)).toBe(5);
    expect(weekSpan(true)).toBe(7);
  });
});

describe("effectiveWeekStart", () => {
  it("prende a semana na segunda enquanto o fim de semana está escondido", () => {
    // Abrir a semana num domingo que a tela não desenha deixaria o primeiro
    // cartão vazio.
    expect(effectiveWeekStart(false, 0)).toBe(1);
    expect(effectiveWeekStart(false, 1)).toBe(1);
  });

  it("devolve a escolha do usuário quando o fim de semana aparece", () => {
    expect(effectiveWeekStart(true, 0)).toBe(0);
    expect(effectiveWeekStart(true, 1)).toBe(1);
  });
});

describe("isWeekendDay", () => {
  it("é sábado e domingo na escala do Date", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(isWeekendDay)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

import { isWeekendDay, weekdayOptions, weekdayValues } from "@shared/utils/weekdays";
import { describe, expect, it } from "vitest";

describe("weekdayOptions", () => {
  it("oferece só os dias úteis com o fim de semana desligado", () => {
    expect(weekdayOptions(false).map((d) => d.label)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex"]);
  });

  it("acrescenta sábado e domingo no fim, sem reordenar os dias úteis", () => {
    // Ligar o fim de semana **acrescenta** — quem marcava "Seg, Qua, Sex"
    // continua encontrando os três nas mesmas posições.
    expect(weekdayOptions(true).map((d) => d.label)).toEqual([
      "Seg",
      "Ter",
      "Qua",
      "Qui",
      "Sex",
      "Sáb",
      "Dom",
    ]);
  });

  it("usa a escala do Date, e não o índice do array", () => {
    // É o que protege `recurringDays`: os valores gravados estão nessa escala, e
    // reindexar para 0..4 mudaria o dia de toda tarefa recorrente já salva.
    // Domingo é 0 e fecha a fila, então a lista não sai em ordem crescente.
    expect(weekdayValues(false)).toEqual([1, 2, 3, 4, 5]);
    expect(weekdayValues(true)).toEqual([1, 2, 3, 4, 5, 6, 0]);

    const domingo = weekdayOptions(true).at(-1)!;
    expect(domingo.value).toBe(0);
    expect(domingo.title).toBe("Domingo");
  });

  it("dá nome por extenso a todo dia oferecido", () => {
    expect(weekdayOptions(true).every((d) => d.title.length > d.label.length)).toBe(true);
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

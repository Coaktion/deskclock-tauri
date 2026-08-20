import { describe, it, expect } from "vitest";
import {
  findColumnValue,
  parseDatePairPeriod,
  parseDayValue,
  parseTimelinePeriod,
  periodOverlaps,
  searchFloorDayISO,
} from "@domain/usecases/monday/mondayItemPeriod";
import type { MondayColumnValue, MondayItem } from "@shared/types/monday";
import { addDaysISO } from "@shared/utils/time";

function col(id: string, type: string, value: string | null, text = ""): MondayColumnValue {
  return { id, type, text, value };
}

function item(columnValues: MondayColumnValue[]): MondayItem {
  return {
    id: "1",
    name: "Item",
    url: "https://monday.com/x",
    boardId: "b1",
    groupId: "g",
    groupTitle: "Timeline",
    createdAt: "2026-07-29T18:40:31Z",
    columnValues,
  };
}

describe("findColumnValue", () => {
  it("devolve undefined quando o id da coluna não foi resolvido no board", () => {
    expect(findColumnValue(item([col("a", "text", null)]), undefined)).toBeUndefined();
  });
});

describe("parseTimelinePeriod", () => {
  it("lê o intervalo da coluna timeline", () => {
    const value = col("t", "timeline", '{"from":"2026-07-16","to":"2026-08-19"}');
    expect(parseTimelinePeriod(value)).toEqual({
      startDayISO: "2026-07-16",
      endDayISO: "2026-08-19",
    });
  });

  it("trata item de um dia só, em que from e to são iguais", () => {
    const value = col("t", "timeline", '{"from":"2026-07-16","to":"2026-07-16"}');
    expect(parseTimelinePeriod(value)).toEqual({
      startDayISO: "2026-07-16",
      endDayISO: "2026-07-16",
    });
  });

  it("não desloca o dia por fuso — a timeline do Monday não tem hora", () => {
    // Passar por `new Date()` leria como meia-noite UTC e, em UTC-3, voltaria
    // para 15/07.
    const value = col("t", "timeline", '{"from":"2026-07-16","to":"2026-07-16"}');
    expect(parseTimelinePeriod(value)?.startDayISO).toBe("2026-07-16");
  });

  it("devolve null para coluna vazia ou JSON inválido", () => {
    expect(parseTimelinePeriod(col("t", "timeline", null))).toBeNull();
    expect(parseTimelinePeriod(col("t", "timeline", "{"))).toBeNull();
    expect(parseTimelinePeriod(undefined)).toBeNull();
  });
});

describe("parseDayValue", () => {
  it("converte data com hora, que o Monday guarda em UTC, para o dia local", () => {
    // O fuso da máquina que roda o teste não é fixo, então o esperado é
    // derivado do mesmo instante: em UTC-3 este valor é 01/07, em UTC é 02/07.
    const d = new Date("2026-07-02T02:00:00Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const value = col("d", "date", '{"date":"2026-07-02","time":"02:00:00"}');
    expect(parseDayValue(value)).toBe(expected);
  });

  it("mantém a data quando não há hora — ela já é o dia", () => {
    expect(parseDayValue(col("d", "date", '{"date":"2026-07-27"}'))).toBe("2026-07-27");
  });

  it("devolve null quando a coluna está vazia", () => {
    expect(parseDayValue(col("d", "date", null))).toBeNull();
  });
});

describe("parseDatePairPeriod", () => {
  const start = col("s", "date", '{"date":"2026-07-01"}');
  const end = col("e", "date", '{"date":"2026-07-28"}');

  it("monta o intervalo a partir de Start Date e End Date", () => {
    expect(parseDatePairPeriod(start, end)).toEqual({
      startDayISO: "2026-07-01",
      endDayISO: "2026-07-28",
    });
  });

  it("usa a ponta existente quando só uma das duas está preenchida", () => {
    expect(parseDatePairPeriod(start, undefined)).toEqual({
      startDayISO: "2026-07-01",
      endDayISO: "2026-07-01",
    });
    expect(parseDatePairPeriod(undefined, end)).toEqual({
      startDayISO: "2026-07-28",
      endDayISO: "2026-07-28",
    });
  });

  it("reordena pontas invertidas no board em vez de gerar intervalo vazio", () => {
    expect(parseDatePairPeriod(end, start)).toEqual({
      startDayISO: "2026-07-01",
      endDayISO: "2026-07-28",
    });
  });

  it("devolve null quando nenhuma das duas colunas tem valor", () => {
    expect(parseDatePairPeriod(undefined, undefined)).toBeNull();
  });
});

describe("periodOverlaps", () => {
  const period = { startDayISO: "2026-07-01", endDayISO: "2026-07-28" };

  it("inclui o item quando o filtro cai no meio do intervalo", () => {
    expect(periodOverlaps(period, "2026-07-15", "2026-07-15")).toBe(true);
  });

  it("inclui quando o filtro toca só a ponta inicial ou a final", () => {
    expect(periodOverlaps(period, "2026-06-01", "2026-07-01")).toBe(true);
    expect(periodOverlaps(period, "2026-07-28", "2026-08-30")).toBe(true);
  });

  it("exclui quando o intervalo está inteiramente fora da janela", () => {
    expect(periodOverlaps(period, "2026-07-29", "2026-07-31")).toBe(false);
    expect(periodOverlaps(period, "2026-06-01", "2026-06-30")).toBe(false);
  });

  it("exclui item sem período — não há como afirmar que ele cai na janela", () => {
    expect(periodOverlaps(null, "2026-07-01", "2026-07-31")).toBe(false);
  });
});

describe("searchFloorDayISO", () => {
  // As quatro janelas do gerenciador: hoje, 7 dias, 30 dias e este mês. A mais
  // antiga é o piso, e nenhuma delas pode perder item por causa dele.
  const windows = (todayISO: string) => [
    todayISO,
    addDaysISO(todayISO, -6),
    addDaysISO(todayISO, -29),
    `${todayISO.slice(0, 8)}01`,
  ];

  it("fica antes do início de toda janela, em qualquer dia do mês", () => {
    for (const today of ["2026-08-01", "2026-08-06", "2026-08-15", "2026-08-31", "2026-01-31"]) {
      const floor = searchFloorDayISO(today);
      for (const start of windows(today)) {
        expect(floor < start).toBe(true);
      }
    }
  });

  it("no fim do mês, quem manda é o começo do mês", () => {
    // Dia 31: o começo do mês está 30 dias atrás, além dos 29 da outra janela.
    expect(searchFloorDayISO("2026-08-31")).toBe(addDaysISO("2026-08-01", -7));
  });

  it("no começo do mês, quem manda são os 30 dias", () => {
    // Dia 1º: o começo do mês é hoje, e a janela de 30 dias vai bem mais longe.
    expect(searchFloorDayISO("2026-08-01")).toBe(addDaysISO("2026-07-03", -7));
  });

  it("atravessa a virada do ano sem se perder", () => {
    expect(searchFloorDayISO("2026-01-05")).toBe("2025-11-30");
  });
});

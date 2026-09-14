import { describe, it, expect } from "vitest";
import {
  formatBrDate,
  fromISODate,
  maskBrDate,
  monthCells,
  monthOf,
  parseBrDate,
  toISODate,
  yearPage,
} from "@shared/utils/calendarGrid";

describe("monthCells", () => {
  it("devolve sempre 42 células, mesmo no mês que cabe em cinco semanas", () => {
    // Fevereiro de 2021 começou numa segunda e tem 28 dias: quatro semanas exatas.
    expect(monthCells(2021, 1)).toHaveLength(42);
    expect(monthCells(2026, 8)).toHaveLength(42);
  });

  it("começa na segunda-feira da semana que contém o dia 1", () => {
    // 1º de setembro de 2026 é uma terça — a grade abre na segunda, dia 31/08.
    expect(monthCells(2026, 8)[0].iso).toBe("2026-08-31");
    // 1º de fevereiro de 2021 é segunda: a grade abre no próprio dia 1.
    expect(monthCells(2021, 1)[0].iso).toBe("2021-02-01");
  });

  it("marca como `outside` o que não é do mês pedido", () => {
    const cells = monthCells(2026, 8);
    expect(cells[0]).toMatchObject({ iso: "2026-08-31", day: 31, outside: true });
    expect(cells[1]).toMatchObject({ iso: "2026-09-01", day: 1, outside: false });
    expect(cells.filter((c) => !c.outside)).toHaveLength(30);
  });

  it("cobre o mês inteiro sem buraco nem repetição", () => {
    const cells = monthCells(2026, 8);
    expect(new Set(cells.map((c) => c.iso)).size).toBe(42);
    const doMes = cells.filter((c) => !c.outside).map((c) => c.day);
    expect(doMes).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("vira o ano quando o mês sai de 0–11", () => {
    // É o que deixa a navegação escrever `mes + 1` sem tratar dezembro.
    expect(monthCells(2026, 12).some((c) => c.iso === "2027-01-15")).toBe(true);
    expect(monthCells(2026, -1).some((c) => c.iso === "2025-12-15")).toBe(true);
  });

  it("atravessa o horário de verão sem pular nem repetir dia", () => {
    // Outubro de 2018 teve virada de horário no Brasil (dia 4, meia-noite).
    const cells = monthCells(2018, 9);
    const dias = cells.filter((c) => !c.outside).map((c) => c.day);
    expect(dias).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe("fromISODate / toISODate", () => {
  it("faz a ida e a volta pela data local", () => {
    expect(toISODate(new Date(2026, 8, 5))).toBe("2026-09-05");
    expect(toISODate(fromISODate("2026-09-05")!)).toBe("2026-09-05");
  });

  it("devolve `null` para data que não existe", () => {
    // Sem a checagem de ida e volta, isto viraria 3 de março em silêncio.
    expect(fromISODate("2026-02-31")).toBeNull();
    expect(fromISODate("2026-13-01")).toBeNull();
  });

  it("devolve `null` para o que não é uma data ISO", () => {
    expect(fromISODate("")).toBeNull();
    expect(fromISODate("05/09/2026")).toBeNull();
    expect(fromISODate("2026-9-5")).toBeNull();
  });

  it("não desloca o dia — a meia-noite é local, não UTC", () => {
    // `new Date("2026-09-05")` é meia-noite UTC, que a oeste de Greenwich cai no
    // dia 4. É o defeito que a fronteira em string existe para impedir.
    expect(fromISODate("2026-09-05")!.getDate()).toBe(5);
  });
});

describe("monthOf", () => {
  it("devolve ano e mês da data, com o mês em base 0", () => {
    expect(monthOf("2026-09-05")).toEqual({ year: 2026, month: 8 });
  });

  it("devolve `null` quando não há data — é o campo vazio", () => {
    expect(monthOf("")).toBeNull();
    expect(monthOf("2026-02-31")).toBeNull();
  });
});

describe("yearPage", () => {
  it("devolve 12 anos com o pedido no sétimo lugar", () => {
    const anos = yearPage(2026);
    expect(anos).toHaveLength(12);
    expect(anos[0]).toBe(2020);
    expect(anos[6]).toBe(2026);
    expect(anos[11]).toBe(2031);
  });

  it("pagina sem sobrepor nem pular ano", () => {
    const atual = yearPage(2026);
    const seguinte = yearPage(2026 + 12);
    expect(seguinte[0]).toBe(atual[11] + 1);
  });
});

describe("formatBrDate", () => {
  it("escreve a data no formato que o campo mostra", () => {
    expect(formatBrDate("2026-09-05")).toBe("05/09/2026");
  });

  it("devolve vazio para vazio — é o campo sem valor, não um erro", () => {
    expect(formatBrDate("")).toBe("");
    expect(formatBrDate("qualquer coisa")).toBe("");
  });
});

describe("parseBrDate", () => {
  it("lê a data digitada", () => {
    expect(parseBrDate("05/09/2026")).toBe("2026-09-05");
    expect(parseBrDate("  05/09/2026  ")).toBe("2026-09-05");
  });

  it("recusa data que não existe em vez de corrigi-la sozinha", () => {
    expect(parseBrDate("31/02/2026")).toBeNull();
    expect(parseBrDate("32/01/2026")).toBeNull();
    expect(parseBrDate("05/13/2026")).toBeNull();
  });

  it("aceita 29 de fevereiro só em ano bissexto", () => {
    expect(parseBrDate("29/02/2024")).toBe("2024-02-29");
    expect(parseBrDate("29/02/2026")).toBeNull();
  });

  it("devolve `null` enquanto a data está incompleta", () => {
    expect(parseBrDate("")).toBeNull();
    expect(parseBrDate("05/09")).toBeNull();
    expect(parseBrDate("05/09/20")).toBeNull();
  });
});

describe("maskBrDate", () => {
  it("põe as barras conforme se digita", () => {
    expect(maskBrDate("0")).toBe("0");
    expect(maskBrDate("05")).toBe("05");
    expect(maskBrDate("059")).toBe("05/9");
    expect(maskBrDate("0509")).toBe("05/09");
    expect(maskBrDate("05092")).toBe("05/09/2");
    expect(maskBrDate("05092026")).toBe("05/09/2026");
  });

  it("ignora o que não é dígito e para nos oito", () => {
    expect(maskBrDate("05/09/2026")).toBe("05/09/2026");
    expect(maskBrDate("a5b0c9d2026")).toBe("50/92/026");
    expect(maskBrDate("050920260000")).toBe("05/09/2026");
  });

  it("deixa passar prefixo que ainda não é data — quem valida é o parse", () => {
    // `05/0` não é data nenhuma, e recusá-lo aqui impediria de escrever 05/09.
    expect(parseBrDate(maskBrDate("050"))).toBeNull();
    expect(maskBrDate("050")).toBe("05/0");
  });
});

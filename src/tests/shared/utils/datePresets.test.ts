import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateRangeFor, matchDateRange } from "@shared/utils/datePresets";

/**
 * O relógio é fixado com componentes **locais** (`new Date(ano, mês, dia, hora)`),
 * nunca com literal UTC: `"2026-09-05T12:00:00Z"` é dia 5 em São Paulo e dia 6
 * em Auckland, e a asserção passaria a depender do fuso da máquina (§7.6).
 *
 * 9 de setembro de 2026 é uma **quarta-feira** — dia escolhido no meio da semana
 * para que a janela móvel de 7 dias e a semana do calendário não coincidam: se
 * coincidissem, o teste não distinguiria `last7` de `thisWeek`, que é justamente
 * a confusão que a tabela única existe para desfazer.
 */
const QUARTA = new Date(2026, 8, 9, 12, 0, 0);

describe("dateRangeFor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(QUARTA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hoje é um dia só", () => {
    expect(dateRangeFor("today")).toEqual({ start: "2026-09-09", end: "2026-09-09" });
  });

  it("ontem é um dia só, o anterior", () => {
    expect(dateRangeFor("yesterday")).toEqual({ start: "2026-09-08", end: "2026-09-08" });
  });

  it("7 dias é janela móvel que termina hoje, contando hoje", () => {
    // Sete dias, não oito: a conta é `hoje − 6`.
    expect(dateRangeFor("last7")).toEqual({ start: "2026-09-03", end: "2026-09-09" });
  });

  it("30 dias segue a mesma régua", () => {
    expect(dateRangeFor("last30")).toEqual({ start: "2026-08-11", end: "2026-09-09" });
  });

  it("esta semana é o calendário de segunda a domingo, não a janela móvel", () => {
    // É a distinção que o nome `week` escondia: numa quarta-feira, a semana do
    // calendário começa dois dias atrás e termina quatro dias à frente.
    expect(dateRangeFor("thisWeek")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
    expect(dateRangeFor("thisWeek")).not.toEqual(dateRangeFor("last7"));
  });

  it("semana passada e próxima são a mesma semana deslocada de sete dias", () => {
    expect(dateRangeFor("lastWeek")).toEqual({ start: "2026-08-31", end: "2026-09-06" });
    expect(dateRangeFor("nextWeek")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });

  it("este mês termina hoje, não no fim do mês", () => {
    // Num app de horas, o mês corrente é o que já se trabalhou dele — e era o
    // que as três cópias faziam.
    expect(dateRangeFor("thisMonth")).toEqual({ start: "2026-09-01", end: "2026-09-09" });
  });

  it("mês passado é o mês inteiro, da primeira à última data", () => {
    expect(dateRangeFor("lastMonth")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("mês passado acerta o fim de mês curto sem tabela de dias", () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // março de 2026
    expect(dateRangeFor("lastMonth")).toEqual({ start: "2026-02-01", end: "2026-02-28" });

    vi.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // março de 2024, bissexto
    expect(dateRangeFor("lastMonth")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("mês passado vira o ano em janeiro", () => {
    vi.setSystemTime(new Date(2026, 0, 10, 12, 0, 0));
    expect(dateRangeFor("lastMonth")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("atravessa a virada do ano na semana", () => {
    // 1º de janeiro de 2027 é uma sexta: a semana dele começa em 2026.
    vi.setSystemTime(new Date(2027, 0, 1, 12, 0, 0));
    expect(dateRangeFor("thisWeek")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  it("todo período tem começo não posterior ao fim", () => {
    const ids = [
      "today",
      "yesterday",
      "last7",
      "last30",
      "thisWeek",
      "lastWeek",
      "nextWeek",
      "thisMonth",
      "lastMonth",
    ] as const;
    for (const id of ids) {
      const { start, end } = dateRangeFor(id);
      expect(start <= end).toBe(true);
    }
  });
});

describe("matchDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(QUARTA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconhece o par que veio de um atalho", () => {
    expect(matchDateRange("2026-09-07", "2026-09-13", ["today", "thisWeek"])).toBe("thisWeek");
  });

  it("devolve `null` para período escolhido à mão", () => {
    expect(matchDateRange("2026-09-02", "2026-09-11", ["today", "thisWeek"])).toBeNull();
  });

  it("só considera os atalhos que a tela oferece", () => {
    // A Agenda não mostra "ontem"; um par que coincida com ele não deve acender
    // pílula nenhuma lá.
    expect(matchDateRange("2026-09-08", "2026-09-08", ["thisWeek", "nextWeek"])).toBeNull();
  });

  it("devolve o primeiro da lista quando dois atalhos coincidem", () => {
    // `today` e `last7` não coincidem numa quarta, mas a ordem precisa ser
    // determinística de qualquer forma — quem lista, decide a precedência.
    expect(matchDateRange("2026-09-09", "2026-09-09", ["today", "yesterday"])).toBe("today");
  });
});

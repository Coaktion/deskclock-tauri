import { describe, it, expect } from "vitest";
import {
  formatHHMMSS,
  formatDurationCompact,
  formatWeekTotal,
  parseDurationInput,
  computeDurationHHMM,
  computeEndHHMM,
} from "@shared/utils/time";

describe("formatHHMMSS", () => {
  it("formata zero segundos", () => expect(formatHHMMSS(0)).toBe("00:00:00"));
  it("formata 1 segundo", () => expect(formatHHMMSS(1)).toBe("00:00:01"));
  it("formata 1 minuto", () => expect(formatHHMMSS(60)).toBe("00:01:00"));
  it("formata 1 hora", () => expect(formatHHMMSS(3600)).toBe("01:00:00"));
  it("formata 1h01m01s", () => expect(formatHHMMSS(3661)).toBe("01:01:01"));
  it("formata 23h59m59s", () => expect(formatHHMMSS(86399)).toBe("23:59:59"));
  it("trata segundos negativos como zero", () => expect(formatHHMMSS(-10)).toBe("00:00:00"));
});

describe("formatDurationCompact", () => {
  it("menos de 1h mostra apenas minutos", () => expect(formatDurationCompact(3540)).toBe("59m"));
  it("exatamente 1h", () => expect(formatDurationCompact(3600)).toBe("1h00m"));
  it("1h30m", () => expect(formatDurationCompact(5400)).toBe("1h30m"));
  it("zero segundos", () => expect(formatDurationCompact(0)).toBe("0m"));
});

describe("formatWeekTotal", () => {
  it("formata total de semana com dias", () =>
    expect(formatWeekTotal(54000, 2)).toBe("15:00:00 2d"));
  it("formata 0 segundos", () => expect(formatWeekTotal(0, 0)).toBe("00:00:00 0d"));
});

describe("parseDurationInput", () => {
  it("parseia HH:MM:SS", () => expect(parseDurationInput("01:30:00")).toBe(5400));
  it("parseia HH:MM - 1h30m resulta em 5400s", () =>
    expect(parseDurationInput("01:30")).toBe(5400));
  it("parseia HH:MM - 0h45m resulta em 2700s", () =>
    expect(parseDurationInput("00:45")).toBe(2700));
  it("parseia HH:MM - 2h00m resulta em 7200s", () =>
    expect(parseDurationInput("02:00")).toBe(7200));
  it("parseia inteiro como minutos", () => expect(parseDurationInput("90")).toBe(5400));
  it("retorna null para formato invalido", () => expect(parseDurationInput("abc")).toBeNull());
  it("retorna null para string vazia", () => expect(parseDurationInput("")).toBeNull());
  // linguagem natural
  it("1 -> 1 minuto (60s)", () => expect(parseDurationInput("1")).toBe(60));
  it("10 -> 10 minutos (600s)", () => expect(parseDurationInput("10")).toBe(600));
  it("1h -> 1 hora (3600s)", () => expect(parseDurationInput("1h")).toBe(3600));
  it("0h 20m -> 20 minutos (1200s)", () => expect(parseDurationInput("0h 20m")).toBe(1200));
  it("1h 2 -> 1h2min (3720s)", () => expect(parseDurationInput("1h 2")).toBe(3720));
  it("1h 30min -> 1h30m (5400s)", () => expect(parseDurationInput("1h 30min")).toBe(5400));
  it("2h 30min -> 2h30m (9000s)", () => expect(parseDurationInput("2h 30min")).toBe(9000));
  it("20m -> 20 minutos (1200s)", () => expect(parseDurationInput("20m")).toBe(1200));
  it("30min -> 30 minutos (1800s)", () => expect(parseDurationInput("30min")).toBe(1800));
});

describe("computeDurationHHMM", () => {
  it("calcula duração simples", () => expect(computeDurationHHMM("09:00", "10:30")).toBe("01:30"));
  it("calcula duração de hora exata", () =>
    expect(computeDurationHHMM("08:00", "09:00")).toBe("01:00"));
  it("trata overnight (fim < início)", () =>
    expect(computeDurationHHMM("23:00", "01:00")).toBe("02:00"));
  it("trata overnight cruzando meia-noite", () =>
    expect(computeDurationHHMM("22:30", "00:30")).toBe("02:00"));
  it("não retorna NaN:NaN para entrada inválida", () =>
    expect(computeDurationHHMM("", "")).toBe("00:01"));
});

describe("computeEndHHMM", () => {
  it("calcula hora fim simples", () => expect(computeEndHHMM("09:00", 3600)).toBe("10:00"));
  it("calcula hora fim com 30min", () => expect(computeEndHHMM("08:00", 1800)).toBe("08:30"));
  it("wrap ao cruzar meia-noite", () => expect(computeEndHHMM("23:00", 7200)).toBe("01:00"));
  it("retorna início para duração inválida", () =>
    expect(computeEndHHMM("09:00", NaN)).toBe("09:00"));
});

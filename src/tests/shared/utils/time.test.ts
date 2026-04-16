import { describe, it, expect } from "vitest";
import {
  formatHHMMSS,
  formatDurationCompact,
  formatWeekTotal,
  parseDurationInput,
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
  it("parseia HH:MM - 1h30m resulta em 5400s", () => expect(parseDurationInput("01:30")).toBe(5400));
  it("parseia HH:MM - 0h45m resulta em 2700s", () => expect(parseDurationInput("00:45")).toBe(2700));
  it("parseia HH:MM - 2h00m resulta em 7200s", () => expect(parseDurationInput("02:00")).toBe(7200));
  it("parseia inteiro como minutos", () => expect(parseDurationInput("90")).toBe(5400));
  it("retorna null para formato invalido", () => expect(parseDurationInput("abc")).toBeNull());
});

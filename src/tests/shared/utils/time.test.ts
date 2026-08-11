import { describe, it, expect } from "vitest";
import {
  formatHHMMSS,
  formatDurationCompact,
  formatWeekTotal,
  parseDurationInput,
  computeDurationHHMM,
  computeEndHHMM,
  localDateISO,
  resolveRegisteredEndHHMM,
  formatRegisteredTimeRange,
  addSecondsISO,
} from "@shared/utils/time";

describe("localDateISO", () => {
  // Datas construídas em horário local para o teste não depender do fuso da máquina
  it("retorna a data local do timestamp", () => {
    expect(localDateISO(new Date(2026, 4, 6, 12, 0).toISOString())).toBe("2026-05-06");
  });
  it("madrugada local permanece no mesmo dia local", () => {
    expect(localDateISO(new Date(2026, 4, 6, 0, 30).toISOString())).toBe("2026-05-06");
  });
  it("fim do dia local permanece no mesmo dia local", () => {
    expect(localDateISO(new Date(2026, 4, 6, 23, 30).toISOString())).toBe("2026-05-06");
  });
});

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
  it("formata o total compacto, sem segundos", () => expect(formatWeekTotal(97920)).toBe("27h12"));
  it("mantém a hora sem zero à esquerda e o minuto com dois dígitos", () =>
    expect(formatWeekTotal(32700)).toBe("9h05"));
  it("passa das 99h sem quebrar", () => expect(formatWeekTotal(468000)).toBe("130h00"));
  it("formata 0 segundos", () => expect(formatWeekTotal(0)).toBe("0h00"));
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
  it("retorna 00:00 quando início igual a fim", () =>
    expect(computeDurationHHMM("10:00", "10:00")).toBe("00:00"));
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

describe("resolveRegisteredEndHHMM", () => {
  it("arredondada: o fim vem da duração gravada, não do instante da parada", () =>
    // 09:00 → 10:23 registrado como 1h30 pela regra de arredondamento
    expect(resolveRegisteredEndHHMM("09:00", 5400, "10:23")).toBe("10:30"));
  it("pausada: o fim vem do tempo somado, não do intervalo", () =>
    // rodou 09:00–10:00, pausou 1h, rodou 11:00–11:30 → 1h30 gravado
    expect(resolveRegisteredEndHHMM("09:00", 5400, "11:30")).toBe("10:30"));
  it("sem divergência, devolve o mesmo fim gravado", () =>
    expect(resolveRegisteredEndHHMM("09:00", 5400, "10:30")).toBe("10:30"));
  it("cruzando meia-noite, o fim dá a volta", () =>
    expect(resolveRegisteredEndHHMM("23:00", 7200, "00:47")).toBe("01:00"));
  it("sem duração gravada, cai no fim registrado", () =>
    expect(resolveRegisteredEndHHMM("09:00", null, "10:23")).toBe("10:23"));
  it("duração zerada não colapsa o fim no início", () =>
    expect(resolveRegisteredEndHHMM("09:00", 0, "10:23")).toBe("10:23"));
  it("sem duração e sem fim, cai no início", () =>
    expect(resolveRegisteredEndHHMM("09:00", null, null)).toBe("09:00"));
});

describe("formatRegisteredTimeRange", () => {
  // Constrói um ISO no fuso local, para a formatação não depender do TZ do runner.
  const at = (h: number, m: number) => new Date(2026, 7, 11, h, m, 0).toISOString();

  it("arredondada: a faixa fecha a conta com a duração, não com a parada", () =>
    // parou 13:41, gravado 45min pelo arredondamento
    expect(formatRegisteredTimeRange(at(13, 0), 2700, at(13, 41))).toBe("13:00–13:45"));

  it("sem arredondamento, a faixa é o intervalo real", () =>
    expect(formatRegisteredTimeRange(at(13, 0), 2280, at(13, 38))).toBe("13:00–13:38"));

  it("pausada: o fim vem do tempo somado, não do intervalo", () =>
    expect(formatRegisteredTimeRange(at(9, 0), 5400, at(11, 30))).toBe("09:00–10:30"));

  it("sem duração gravada, cai no fim registrado", () =>
    expect(formatRegisteredTimeRange(at(9, 0), null, at(10, 23))).toBe("09:00–10:23"));

  it("tarefa em aberto não tem faixa, só o começo", () =>
    expect(formatRegisteredTimeRange(at(9, 0), null, null)).toBe("09:00"));

  it("duração zerada e sem fim também não inventa faixa", () =>
    expect(formatRegisteredTimeRange(at(9, 0), 0, null)).toBe("09:00"));
});

describe("addSecondsISO", () => {
  it("desloca o instante para frente", () =>
    expect(addSecondsISO("2026-08-11T13:00:00.000Z", 2700)).toBe("2026-08-11T13:45:00.000Z"));

  it("aceita deslocamento negativo", () =>
    expect(addSecondsISO("2026-08-11T13:45:00.000Z", -900)).toBe("2026-08-11T13:30:00.000Z"));

  it("atravessa a virada do dia", () =>
    expect(addSecondsISO("2026-08-11T23:30:00.000Z", 3600)).toBe("2026-08-12T00:30:00.000Z"));
});

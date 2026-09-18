import { describe, it, expect } from "vitest";
import { formatUtcOffset, localClock } from "@shared/utils/localClock";

describe("formatUtcOffset", () => {
  it("inverte o sinal do getTimezoneOffset e formata ±HH:MM", () => {
    expect(formatUtcOffset(180)).toBe("-03:00");
    expect(formatUtcOffset(-330)).toBe("+05:30");
    expect(formatUtcOffset(0)).toBe("+00:00");
  });
});

describe("localClock", () => {
  it("devolve a data recebida, o dia da semana em inglês e o offset do instante", () => {
    const now = "2026-09-18T15:00:00.000Z";
    expect(localClock("2026-09-18", now)).toEqual({
      date: "2026-09-18",
      weekday: "Friday",
      utcOffset: formatUtcOffset(new Date(now).getTimezoneOffset()),
    });
    expect(localClock("2026-09-20", now).weekday).toBe("Sunday");
  });
});

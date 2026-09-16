import { describe, it, expect } from "vitest";
import { DomainError } from "@shared/errors";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { assertDate, periodRange } from "@presentation/localApi/period";
import { makeDeps, TODAY } from "./fakeDeps";

describe("assertDate", () => {
  it("aceita YYYY-MM-DD e recusa o resto com DomainError citando o campo", () => {
    expect(() => assertDate("2026-09-15", "date")).not.toThrow();
    expect(() => assertDate("15/09/2026", "from")).toThrow(
      new DomainError("from deve estar no formato YYYY-MM-DD")
    );
  });
});

describe("periodRange", () => {
  it("sem from é hoje, sem to é o mesmo dia de from, nos limites do dia", () => {
    expect(periodRange(makeDeps(), {})).toEqual({
      from: TODAY,
      to: TODAY,
      startISO: startOfDayISO(TODAY),
      endISO: endOfDayISO(TODAY),
    });
    expect(periodRange(makeDeps(), { from: "2026-09-01" }).to).toBe("2026-09-01");
  });

  it("recusa from depois de to", () => {
    expect(() => periodRange(makeDeps(), { from: "2026-09-10", to: "2026-09-01" })).toThrow(
      DomainError
    );
  });
});

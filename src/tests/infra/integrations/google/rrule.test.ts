import { describe, it, expect } from "vitest";
import { parseRRuleDays } from "@infra/integrations/google/rrule";

describe("parseRRuleDays", () => {
  describe("FREQ=DAILY", () => {
    it("retorna todos os 7 dias", () => {
      expect(parseRRuleDays("RRULE:FREQ=DAILY", 1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("ignora outros parâmetros presentes junto com DAILY", () => {
      expect(parseRRuleDays("RRULE:FREQ=DAILY;COUNT=30", 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe("FREQ=WEEKLY com BYDAY", () => {
    it("extrai dia único — segunda-feira", () => {
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=MO", 0)).toEqual([1]);
    });

    it("extrai múltiplos dias — seg, qua, sex", () => {
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR", 0)).toEqual([1, 3, 5]);
    });

    it("mapeia todos os códigos BYDAY corretamente", () => {
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=SU", 0)).toEqual([0]);
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=MO", 0)).toEqual([1]);
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=TU", 0)).toEqual([2]);
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=WE", 0)).toEqual([3]);
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=TH", 0)).toEqual([4]);
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=FR", 0)).toEqual([5]);
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=SA", 0)).toEqual([6]);
    });

    it("extrai fim de semana completo", () => {
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;BYDAY=SU,SA", 0)).toEqual([0, 6]);
    });

    it("tolera parâmetros extras antes e depois de BYDAY", () => {
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU;COUNT=10", 0)).toEqual([2]);
    });
  });

  describe("FREQ=WEEKLY sem BYDAY", () => {
    it("usa o fallback quando BYDAY está ausente", () => {
      expect(parseRRuleDays("RRULE:FREQ=WEEKLY", 3)).toEqual([3]);
    });

    it("respeita qualquer valor de fallback (0–6)", () => {
      for (let day = 0; day <= 6; day++) {
        expect(parseRRuleDays("RRULE:FREQ=WEEKLY;INTERVAL=2", day)).toEqual([day]);
      }
    });
  });

  describe("frequências não suportadas", () => {
    it("retorna [] para FREQ=MONTHLY", () => {
      expect(parseRRuleDays("RRULE:FREQ=MONTHLY;BYDAY=1MO", 1)).toEqual([]);
    });

    it("retorna [] para FREQ=YEARLY", () => {
      expect(parseRRuleDays("RRULE:FREQ=YEARLY", 0)).toEqual([]);
    });

    it("retorna [] para string vazia", () => {
      expect(parseRRuleDays("", 2)).toEqual([]);
    });
  });
});

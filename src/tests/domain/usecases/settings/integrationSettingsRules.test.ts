import { describe, it, expect } from "vitest";
import {
  isSheetColumnMapping,
  isTimeOfDay,
  normalizeSheetName,
} from "@domain/usecases/settings/integrationSettingsRules";
import { DEFAULT_COLUMN_MAPPING } from "@shared/types/sheetsConfig";

describe("regras dos ajustes de integração", () => {
  it("aba em branco vira DeskClock; o resto é aparado", () => {
    expect(normalizeSheetName("   ")).toBe("DeskClock");
    expect(normalizeSheetName("  Horas ")).toBe("Horas");
  });

  it("horário no formato do campo de hora", () => {
    expect(isTimeOfDay("18:00")).toBe(true);
    expect(isTimeOfDay("23:59")).toBe(true);
    expect(isTimeOfDay("24:00")).toBe(false);
    expect(isTimeOfDay("9:00")).toBe(false);
    expect(isTimeOfDay(900)).toBe(false);
  });

  it("mapeamento de colunas: os oito campos, uma vez cada, em qualquer ordem", () => {
    expect(isSheetColumnMapping([...DEFAULT_COLUMN_MAPPING].reverse())).toBe(true);
    expect(isSheetColumnMapping(DEFAULT_COLUMN_MAPPING.slice(1))).toBe(false);
    const repeated = [...DEFAULT_COLUMN_MAPPING.slice(1), DEFAULT_COLUMN_MAPPING[1]];
    expect(isSheetColumnMapping(repeated)).toBe(false);
    const badLabel = DEFAULT_COLUMN_MAPPING.map((c, i) => (i === 0 ? { ...c, label: 1 } : c));
    expect(isSheetColumnMapping(badLabel)).toBe(false);
    const unknown = DEFAULT_COLUMN_MAPPING.map((c, i) => (i === 0 ? { ...c, field: "x" } : c));
    expect(isSheetColumnMapping(unknown)).toBe(false);
  });
});

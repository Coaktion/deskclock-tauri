import { describe, expect, it } from "vitest";
import {
  DAILY_GOAL_RANGE,
  isIntegerInRange,
  isRoundingSlot,
  normalizeRoundingSlots,
  toggleRoundingSlot,
} from "@domain/usecases/settings/settingsRules";

describe("settingsRules", () => {
  it("aceita só inteiro dentro da faixa, como o campo numérico ao perder o foco", () => {
    expect(isIntegerInRange(8, DAILY_GOAL_RANGE)).toBe(true);
    expect(isIntegerInRange(24, DAILY_GOAL_RANGE)).toBe(true);
    expect(isIntegerInRange(0, DAILY_GOAL_RANGE)).toBe(false);
    expect(isIntegerInRange(25, DAILY_GOAL_RANGE)).toBe(false);
    expect(isIntegerInRange(7.5, DAILY_GOAL_RANGE)).toBe(false);
    expect(isIntegerInRange("8", DAILY_GOAL_RANGE)).toBe(false);
  });

  it("reconhece só os slots que a tela oferece", () => {
    expect(isRoundingSlot(15)).toBe(true);
    expect(isRoundingSlot(60)).toBe(true);
    expect(isRoundingSlot(7)).toBe(false);
    expect(isRoundingSlot(65)).toBe(false);
  });

  it("liga e desliga um slot mantendo a ordem crescente", () => {
    expect(toggleRoundingSlot([15, 45], 30)).toEqual([15, 30, 45]);
    expect(toggleRoundingSlot([15, 30, 45], 30)).toEqual([15, 45]);
    expect(toggleRoundingSlot([], 5)).toEqual([5]);
  });

  it("normaliza a lista sem repetição e em ordem", () => {
    expect(normalizeRoundingSlots([45, 15, 45, 30])).toEqual([15, 30, 45]);
    expect(normalizeRoundingSlots([])).toEqual([]);
  });
});

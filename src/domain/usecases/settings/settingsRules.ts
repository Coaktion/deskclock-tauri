import { ALL_ROUNDING_SLOTS, type RoundingSlot } from "@shared/utils/roundDuration";

/**
 * As faixas e as opções que os controles de Configurações oferecem. Moram aqui,
 * e não em cada aba, porque a API local grava as mesmas chaves e precisa recusar
 * o que a tela nem deixa escolher.
 */

export interface NumberRange {
  min: number;
  max: number;
}

/** "Meta diária (horas)" e "Meta semanal (horas)" da aba Geral. */
export const DAILY_GOAL_RANGE: NumberRange = { min: 1, max: 24 };
export const WEEKLY_GOAL_RANGE: NumberRange = { min: 1, max: 168 };

/** "Opacidade em repouso" da aba Overlay, em %. */
export const OVERLAY_OPACITY_RANGE: NumberRange = { min: 20, max: 100 };

/** As fichas de "Tolerância" do arredondamento, em minutos. */
export const ROUNDING_TOLERANCE_OPTIONS = [0, 1, 2, 5, 10, 15] as const;

/** Inteiro dentro da faixa — o que o campo numérico aceita ao perder o foco. */
export function isIntegerInRange(value: unknown, range: NumberRange): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max
  );
}

export function isRoundingSlot(value: unknown): value is RoundingSlot {
  return ALL_ROUNDING_SLOTS.includes(value as RoundingSlot);
}

/** Liga ou desliga um slot, mantendo a lista em ordem crescente, como a ficha da tela. */
export function toggleRoundingSlot(slots: RoundingSlot[], slot: RoundingSlot): RoundingSlot[] {
  return slots.includes(slot)
    ? slots.filter((s) => s !== slot)
    : ([...slots, slot].sort((a, b) => a - b) as RoundingSlot[]);
}

/** A lista que a tela gravaria: sem repetição e em ordem crescente. */
export function normalizeRoundingSlots(slots: RoundingSlot[]): RoundingSlot[] {
  return [...new Set(slots)].sort((a, b) => a - b);
}

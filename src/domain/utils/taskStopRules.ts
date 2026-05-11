import { roundDuration } from "@shared/utils/roundDuration";
import type { RoundingSlot } from "@shared/utils/roundDuration";

export function shouldDiscardTask(durationSeconds: number, discardEnabled: boolean): boolean {
  return discardEnabled && durationSeconds < 60;
}

export function computeRoundedDuration(
  durationSeconds: number,
  roundingEnabled: boolean,
  roundingSlots: RoundingSlot[],
  toleranceMinutes: number
): number | null {
  if (!roundingEnabled || durationSeconds <= 0) return null;
  const rounded = roundDuration(durationSeconds, roundingSlots, toleranceMinutes);
  return rounded !== durationSeconds ? rounded : null;
}

export type RoundingSlot = 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;

export const ALL_ROUNDING_SLOTS: RoundingSlot[] = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

function isValidMinute(m: number, activeSlots: RoundingSlot[]): boolean {
  const remainder = m % 60;
  if (remainder === 0) return activeSlots.includes(60);
  return (activeSlots as number[]).includes(remainder);
}

/**
 * Arredonda uma duração em segundos usando slots ativos e tolerância.
 * A duração permanece no slot inferior se estiver dentro de
 * `toleranceMinutes` acima dele; caso contrário sobe para o slot superior.
 * Os slots repetem-se a cada 60 minutos (ex: slots=[15,30] → snaps em 15, 30, 75, 90…).
 */
export function roundDuration(
  seconds: number,
  activeSlots: RoundingSlot[],
  toleranceMinutes: number
): number {
  if (seconds === 0 || activeSlots.length === 0) return seconds;

  const toleranceSec = toleranceMinutes * 60;
  const minuteFloor = Math.floor(seconds / 60);

  // Find lower snap point (highest valid minute ≤ minuteFloor)
  let lowerSnap = 0;
  for (let m = minuteFloor; m >= 1; m--) {
    if (isValidMinute(m, activeSlots)) {
      lowerSnap = m * 60;
      break;
    }
  }

  // Exact hit on a snap point
  if (lowerSnap === seconds) return seconds;

  // Within tolerance: stay on lower snap
  if (seconds <= lowerSnap + toleranceSec) return lowerSnap;

  // Beyond tolerance: find next snap point above
  const minuteAbove = minuteFloor + 1;
  for (let m = minuteAbove; m <= minuteAbove + 60; m++) {
    if (isValidMinute(m, activeSlots)) return m * 60;
  }

  return seconds;
}

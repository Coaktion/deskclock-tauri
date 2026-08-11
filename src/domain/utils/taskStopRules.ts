import { roundDuration } from "@shared/utils/roundDuration";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import { addSecondsISO } from "@shared/utils/time";

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

/**
 * O que gravar quando o arredondamento age: a duração arredondada **e** o fim que
 * fecha a conta com ela. Reescrever só a duração deixava o registro contradizendo
 * a si mesmo — a lista mostrava o instante real da parada ao lado de uma duração
 * que não chegava até lá. Quem liga o arredondamento abre mão do horário real em
 * troca de um registro coerente; o preço, numa tarefa que passou por pausas, é o
 * fim recuar para `início + duração`.
 *
 * Devolve `null` quando não há nada a mudar.
 */
export function computeRoundedStop(
  startTimeISO: string,
  durationSeconds: number,
  roundingEnabled: boolean,
  roundingSlots: RoundingSlot[],
  toleranceMinutes: number
): { durationSeconds: number; endTime: string } | null {
  const rounded = computeRoundedDuration(
    durationSeconds,
    roundingEnabled,
    roundingSlots,
    toleranceMinutes
  );
  if (rounded === null) return null;
  return { durationSeconds: rounded, endTime: addSecondsISO(startTimeISO, rounded) };
}

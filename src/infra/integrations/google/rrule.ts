/** Mapeamento de código RRULE BYDAY → índice de dia da semana (0=Dom…6=Sáb). */
export const BYDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/**
 * Extrai os dias da semana (0–6) de uma string RRULE do Google Calendar.
 *
 * Suporta:
 * - FREQ=DAILY → todos os dias [0..6]
 * - FREQ=WEEKLY;BYDAY=MO,WE,FR → dias explícitos
 * - FREQ=WEEKLY (sem BYDAY) → dia da semana do evento (fallback)
 *
 * Retorna [] para frequências não suportadas (MONTHLY, YEARLY…).
 */
export function parseRRuleDays(rrule: string, fallbackDayOfWeek: number): number[] {
  if (/FREQ=DAILY/.test(rrule)) return [0, 1, 2, 3, 4, 5, 6];

  const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
  if (bydayMatch) {
    const days = bydayMatch[1]
      .split(",")
      .map((d) => BYDAY_MAP[d])
      .filter((d) => d !== undefined);
    if (days.length > 0) return days;
  }

  // FREQ=WEEKLY sem BYDAY → usa o dia da semana do próprio evento como fallback
  if (/FREQ=WEEKLY/.test(rrule)) return [fallbackDayOfWeek];

  return [];
}

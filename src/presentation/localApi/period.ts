import { DomainError } from "@shared/errors";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import type { LocalApiDeps, LocalApiParams } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string, field: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new DomainError(`${field} deve estar no formato YYYY-MM-DD`);
  }
}

/**
 * Período em dias locais convertido nos limites do dia (§6.6), como o Histórico
 * faz. Sem `from`, é hoje; sem `to`, o mesmo dia de `from`.
 */
export function periodRange(deps: LocalApiDeps, params: LocalApiParams) {
  const from = params.from || deps.todayISO();
  const to = params.to || from;
  assertDate(from, "from");
  assertDate(to, "to");
  if (from > to) throw new DomainError("from não pode ser posterior a to");
  return { from, to, startISO: startOfDayISO(from), endISO: endOfDayISO(to) };
}

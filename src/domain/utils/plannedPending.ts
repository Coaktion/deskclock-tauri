import type { PlannedTask } from "@domain/entities/PlannedTask";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";

/**
 * As planejadas que ainda faltam no dia — concluir uma planejada não a apaga,
 * marca a data em `completedDates` (§6).
 */
export function pendingPlannedTasks(tasks: PlannedTask[], dateISO: string): PlannedTask[] {
  return tasks.filter((task) => !task.completedDates.includes(dateISO));
}

/**
 * O que a lista do omnibox mostra: as pendentes do dia, recortadas pelo que já
 * foi digitado no campo. Busca vazia devolve todas — é assim que focar o campo
 * mostra o plano do dia sem que ninguém digite nada.
 *
 * O recorte é `fuzzyMatch`, o mesmo do `Autocomplete`, e só sobre o **nome**:
 * filtrar por projeto obrigaria a passar o catálogo inteiro para cá por pouco
 * retorno numa lista que já está limitada a um dia.
 */
export function matchPlannedTasks(
  tasks: PlannedTask[],
  dateISO: string,
  query: string
): PlannedTask[] {
  const pending = pendingPlannedTasks(tasks, dateISO);
  const q = query.trim();
  if (!q) return pending;
  return pending.filter((task) => fuzzyMatch(q, task.name));
}

/**
 * As pontas de um agendamento por período, e por que elas não são simétricas.
 *
 * **O fim é opcional; o início não.** Não é escolha de UI — é o que as quatro
 * consultas de `PlannedTaskRepository` (`findForDate` e `findForWeek`, cada uma
 * com e sem workspace) fazem:
 *
 * ```sql
 * period_start <= $1 AND (period_end IS NULL OR period_end >= $1)
 * ```
 *
 * `period_end IS NULL` é ramo explícito, então fim nulo é "não termina" e a
 * planejada aparece do início em diante. Já `period_start <= $1` com `NULL`
 * devolve `NULL`, e `WHERE NULL` não é verdadeiro: a linha não sai em consulta
 * nenhuma. Período sem início não fica sem começo — **some de todas as telas
 * sem estar excluído**.
 *
 * A regra morava escrita só dentro do `PlannedTaskForm`, e lá ela exigia as
 * duas pontas. O editor (`usePlannedTaskEditor`) não a tinha, e mapeava `""` para
 * `null` sem conferir nada — dava para editar uma planejada até um estado que o
 * formulário de criação não deixava nascer.
 */
export function isPeriodScheduleValid(periodStart: string, periodEnd: string): boolean {
  if (!periodStart) return false;
  return !periodEnd || periodEnd >= periodStart;
}

/**
 * O período está **invertido** — erro de verdade, que pinta a borda.
 *
 * Só com as duas pontas preenchidas: enquanto falta uma, o período está
 * incompleto, não errado, e acusar erro de quem ainda está digitando é acusar
 * um erro que a pessoa não cometeu.
 */
export function isPeriodInverted(periodStart: string, periodEnd: string): boolean {
  return !!periodStart && !!periodEnd && periodEnd < periodStart;
}

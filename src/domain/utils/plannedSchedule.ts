import type { PlannedTask } from "@domain/entities/PlannedTask";

export interface PlannedScheduleGroups {
  /** Com hora marcada, em ordem de relógio. */
  timed: PlannedTask[];
  /** Sem hora marcada, na ordem recebida — o `sort_order` do repositório. */
  untimed: PlannedTask[];
}

/**
 * Separa as planejadas pelo que elas têm de comum: **ter ou não hora marcada**.
 *
 * O critério é um atributo da própria planejada, e é isso que o mantém aqui em
 * vez de na fronteira de alguma integração. Hoje quem preenche `startTime` é só
 * o import da Agenda, então na prática a primeira lista são os eventos e a
 * segunda são as tarefas comuns — mas o app não pergunta de onde a planejada
 * veio, e não precisa: a procedência mora em `calendar_tracked_meetings` e
 * `monday_imported_items`, e a lista que agrupa não as consulta.
 *
 * Sem hora fica **depois**, e na ordem que chegou: quem tem horário é cobrado
 * pelo relógio, e ordená-lo à mão seria mandar no que o dia já mandou. O resto
 * continua respondendo ao arraste do Planejamento.
 */
export function groupPlannedBySchedule(tasks: PlannedTask[]): PlannedScheduleGroups {
  const timed: PlannedTask[] = [];
  const untimed: PlannedTask[] = [];

  for (const task of tasks) {
    if (task.startTime?.trim()) timed.push(task);
    else untimed.push(task);
  }

  // `sort` é estável desde o ES2019, então dois eventos no mesmo horário saem na
  // ordem em que entraram — que é o `sort_order` do repositório.
  timed.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  return { timed, untimed };
}

import type { TaskGroup } from "@domain/utils/groupTasks";

export interface SentResolution {
  /** Ids a marcar como enviados — exatamente os que a integração confirmou. */
  taskIds: string[];
  /** Grupos confirmados **por inteiro**, que é o que a contagem da tela pode afirmar. */
  fullySentGroups: number;
}

/**
 * Traduz o `sentTaskIds` de um `TaskSendOutcome` de volta para as tarefas da tela.
 *
 * Os dois modos existem porque os senders recebem cargas diferentes: com
 * `sendsRawTasks` as tarefas vão cruas e os ids que voltam já são delas; sem
 * ele, vai **um representante por grupo** (a primeira tarefa, com a duração
 * somada) e o id que volta é o do representante — o grupo inteiro subiu junto,
 * num registro só no destino.
 *
 * **No modo cru a marcação é exata, nunca por grupo.** A tentação é dar o grupo
 * por enviado quando *alguma* tarefa dele voltou, e isso está errado: o
 * agrupamento da tela (§6.3) **não** inclui `billable`, enquanto o do Monday
 * inclui — um grupo com o indicador alternado na lista vira dois itens no board.
 * Recusado o não faturável (por falta de motivo, que é o caso que originou tudo
 * isto) e aceito o faturável, marcar o grupo daria o badge "Enviado" a horas que
 * nunca chegaram ao board — e o badge é justamente o que impede o reenvio.
 *
 * A contagem exibida é conservadora pelo mesmo motivo: só conta o grupo cujas
 * tarefas foram **todas** confirmadas. O grupo parcial aparece na lista de
 * recusados, que diz o que faltou.
 */
export function resolveSentTasks(
  groups: TaskGroup[],
  sentTaskIds: string[],
  sendsRawTasks: boolean
): SentResolution {
  const confirmed = new Set(sentTaskIds);

  if (!sendsRawTasks) {
    const sentGroups = groups.filter((g) => confirmed.has(g.tasks[0].id));
    return {
      taskIds: sentGroups.flatMap((g) => g.tasks.map((t) => t.id)),
      fullySentGroups: sentGroups.length,
    };
  }

  return {
    taskIds: groups.flatMap((g) => g.tasks.filter((t) => confirmed.has(t.id)).map((t) => t.id)),
    fullySentGroups: groups.filter((g) => g.tasks.every((t) => confirmed.has(t.id))).length,
  };
}

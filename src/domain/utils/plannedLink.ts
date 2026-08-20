import type { Task } from "@domain/entities/Task";

/**
 * Qual passa a ser a planejada de origem depois de um `RUNNING_TASK_CHANGED`
 * vindo de outra janela.
 *
 * O campo `plannedTaskId` do evento é opcional, e a ausência é significativa:
 * quem pausa, retoma ou atualiza a tarefa não mexe na origem dela e omite o
 * campo de propósito. Colapsar essa omissão em `null` apagava o vínculo no meio
 * da execução — foi assim que pausar pelo popup deixava a janela principal sem
 * saber de qual planejada a tarefa tinha vindo.
 *
 * Sem tarefa, não há origem: parar e cancelar limpam.
 */
export function resolveActivePlannedLink(
  current: string | null,
  task: Task | null,
  plannedTaskId: string | null | undefined
): string | null {
  if (!task) return null;
  if (plannedTaskId === undefined) return current;
  return plannedTaskId;
}

/**
 * De qual planejada veio a execução em curso, para quem só precisa da resposta e
 * não do vínculo vivo: o link do contexto, e o gravado na tarefa como reserva.
 *
 * O par existe porque as duas fontes falham em momentos diferentes — o link
 * some quando outra janela emite um evento sem o campo, e o campo da tarefa
 * está vazio na execução que não nasceu de uma planejada. É o mesmo `??` que o
 * `updateActiveTask` já faz, e ele mora aqui para não haver uma segunda leitura
 * do vínculo que esqueça metade dele.
 */
export function runningPlannedTaskId(
  activePlannedTaskId: string | null,
  task: Task | null
): string | null {
  if (!task) return null;
  return activePlannedTaskId ?? task.plannedTaskId ?? null;
}

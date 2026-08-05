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

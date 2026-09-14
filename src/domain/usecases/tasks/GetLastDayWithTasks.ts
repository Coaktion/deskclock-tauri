import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { getTasksForDate } from "./GetTasksForDate";

export interface LastDayWithTasks {
  dateISO: string;
  tasks: Task[];
}

/**
 * O último dia local com trabalho registrado e as tarefas desse dia, numa chamada.
 *
 * Não é "ontem": depois de um fim de semana, de um feriado ou de férias, o dia
 * anterior não tem nada, e é justamente o dia com registro que interessa a quem
 * olha para trás.
 *
 * `workspaceId` omitido olha todos os workspaces — o dia encontrado e as tarefas
 * devolvidas usam sempre o mesmo escopo, senão o dia viria de um workspace e a
 * lista, de outro.
 */
export async function getLastDayWithTasks(
  repo: ITaskRepository,
  workspaceId?: string
): Promise<LastDayWithTasks | null> {
  const dateISO = await repo.findLastDayWithCompletedTasks(workspaceId);
  if (!dateISO) return null;

  const tasks = await getTasksForDate(repo, dateISO, workspaceId);
  return { dateISO, tasks: tasks.filter((task) => task.status === "completed") };
}

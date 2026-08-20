import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";

type UpdateTaskGroupInput = Parameters<typeof updateTask>[2];

/**
 * Aplica a mesma edição a todas as tarefas de um grupo (§6.3). O grupo é uma
 * peça de tela — nome + projeto + categoria + campos personalizados —, e editar
 * qualquer um desses campos numa irmã só desfaria o agrupamento sem o usuário
 * ter pedido: o que ele vê é uma linha, e é ela inteira que ele está editando.
 *
 * Recebe as tarefas já agrupadas em vez de reagrupar por conta: quem as tem é a
 * tela, e refazer a busca aqui abriria espaço para os dois lados discordarem
 * sobre o que está no grupo.
 */
export async function updateTaskGroup(
  repo: ITaskRepository,
  tasks: Task[],
  input: UpdateTaskGroupInput,
  nowISO: string
): Promise<Task[]> {
  return Promise.all(tasks.map((t) => updateTask(repo, t.id, input, nowISO)));
}

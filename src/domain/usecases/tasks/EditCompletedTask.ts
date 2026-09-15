import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { setGroupBillable } from "@domain/usecases/tasks/SetGroupBillable";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";

type EditCompletedTaskInput = Parameters<typeof updateTask>[2];

/**
 * Edição de uma tarefa concluída: grava a tarefa e leva o billable resultante ao
 * grupo. Faturamento é do grupo (§6.2) — editar só a tarefa deixava a irmã com o
 * valor antigo. Vale o que foi salvo, inclusive quando a edição mudou a chave e
 * a tarefa passou a outro grupo, que recebe o valor dela. Grupo já uniforme não
 * gera escrita. É o que o modal de edição e o `PUT /tasks/{id}` fazem.
 */
export async function editCompletedTask(
  repo: ITaskRepository,
  id: string,
  input: EditCompletedTaskInput,
  nowISO: string
): Promise<Task> {
  const updated = await updateTask(repo, id, input, nowISO);
  await setGroupBillable(repo, updated, updated.billable, nowISO);
  return updated;
}

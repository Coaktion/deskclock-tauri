import type { Task } from "@domain/entities/Task";
import type { ITaskSender, TaskSendOutcome } from "@domain/integrations/ITaskSender";

export class NoIntegrationError extends Error {
  constructor() {
    super("Nenhuma integração configurada.");
    this.name = "NoIntegrationError";
  }
}

export class NoTasksSelectedError extends Error {
  constructor() {
    super("Nenhuma tarefa selecionada.");
    this.name = "NoTasksSelectedError";
  }
}

/**
 * Envia tarefas selecionadas para uma integração externa.
 *
 * Devolve o resultado do sender em vez de descartá-lo: é ele que diz o que
 * chegou ao destino, e sem isso quem chama só saberia distinguir "tudo" de
 * "nada" (§ `TaskSendOutcome`).
 *
 * @param sender - implementação concreta de ITaskSender (ou null se não configurada)
 * @param tasks  - lista de tarefas a enviar
 */
export async function sendTasks(
  sender: ITaskSender | null,
  tasks: Task[]
): Promise<TaskSendOutcome> {
  if (!sender) throw new NoIntegrationError();
  if (tasks.length === 0) throw new NoTasksSelectedError();
  return sender.send(tasks);
}

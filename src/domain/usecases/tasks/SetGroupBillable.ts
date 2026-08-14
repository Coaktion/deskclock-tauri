import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { taskGroupKey } from "@domain/utils/groupTasks";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { localDateISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";

/**
 * Faturamento é atributo do **grupo**, não da tarefa solta.
 *
 * `billable` não compõe a chave de agrupamento (§6.3), então duas irmãs podem
 * divergir nele — e aí o cabeçalho do grupo, que mostra o valor da primeira,
 * passa a mentir sobre as outras sem nada na tela avisando que mente. A saída é
 * a alternância valer para as irmãs junto: quem muda uma, muda o grupo.
 *
 * As irmãs são procuradas no **dia e no workspace** da tarefa porque é esse o
 * recorte em que o grupo existe — `groupTasks` sempre recebe a lista de um dia
 * (hoje, ou a data aberta no histórico) de um workspace. E só entram tarefas
 * **concluídas**, que são as que a lista agrupa: uma execução em curso com o
 * mesmo nome não está no grupo e não pode ser arrastada por ele.
 *
 * Devolve as tarefas que **mudaram** — vazio quando o grupo já era uniforme. É
 * por isso que chamar isto depois de uma edição qualquer não gera escrita: a
 * regra só age onde havia divergência, sem mexer no `updatedAt` das irmãs à toa.
 */
export async function setGroupBillable(
  repo: ITaskRepository,
  task: Task,
  billable: boolean,
  nowISO: string
): Promise<Task[]> {
  const dateISO = localDateISO(task.startTime);
  const sameDay = await repo.findByDateRange(
    startOfDayISO(dateISO),
    endOfDayISO(dateISO),
    task.workspaceId
  );

  const key = taskGroupKey(task);
  const group = sameDay.filter((t) => t.status === "completed" && taskGroupKey(t) === key);
  // O alvo entra mesmo que a consulta não o traga: ele é quem o usuário clicou,
  // e depender da busca faria a alternância virar um no-op silencioso.
  const targets = group.some((t) => t.id === task.id) ? group : [...group, task];

  return Promise.all(
    targets
      .filter((t) => t.billable !== billable)
      .map((t) => updateTask(repo, t.id, { billable }, nowISO))
  );
}

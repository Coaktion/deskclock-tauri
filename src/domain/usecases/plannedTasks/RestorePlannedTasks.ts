import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

/**
 * Desfaz o `deletePlannedTasks` reinserindo o snapshot **intacto**, com o mesmo
 * id: os vínculos (`tasks.planned_task_id`, `monday_imported_items`,
 * `calendar_tracked_meetings`) não têm FK e sobrevivem à exclusão, então voltar
 * o id os reconecta; `sortOrder` devolve a tarefa à mesma posição.
 *
 * Idempotente: o `listen` do Tauri pode entregar o evento de desfazer duas vezes
 * sob StrictMode, e o snapshot que já está no banco é pulado em vez de duplicar
 * ou esbarrar na chave primária. Devolve só os que de fato restaurou.
 */
export async function restorePlannedTasks(
  repo: IPlannedTaskRepository,
  snapshots: PlannedTask[]
): Promise<PlannedTask[]> {
  const restored: PlannedTask[] = [];
  for (const snapshot of snapshots) {
    if (await repo.findById(snapshot.id)) continue;
    await repo.save(snapshot);
    restored.push(snapshot);
  }
  return restored;
}

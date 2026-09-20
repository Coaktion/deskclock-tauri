import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

/**
 * Desfaz o `deleteTasks` reinserindo o snapshot **intacto**, com o mesmo id. O
 * `save` é INSERT e grava também `plannedTaskId` e os `customValues`; os
 * vínculos de fora (`task_integration_log`,
 * `calendar_tracked_meetings.started_task_id`, os `task_ids` de
 * `monday_activity_items`) não têm FK e sobrevivem à exclusão, então voltar o
 * id os reconecta — o "enviado" do lançamento volta junto.
 *
 * Idempotente: o `listen` do Tauri pode entregar o evento de desfazer duas vezes
 * sob StrictMode, e o snapshot que já está no banco é pulado em vez de duplicar
 * ou esbarrar na chave primária. Devolve só os que de fato restaurou.
 */
export async function restoreTasks(repo: ITaskRepository, snapshots: Task[]): Promise<Task[]> {
  const restored: Task[] = [];
  for (const snapshot of snapshots) {
    if (await repo.findById(snapshot.id)) continue;
    await repo.save(snapshot);
    restored.push(snapshot);
  }
  return restored;
}

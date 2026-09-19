import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import type { UUID } from "@shared/types";

/**
 * Exclusão de lançamentos com desfazer — o mesmo desenho do `deletePlannedTasks`
 * (spec `acoes-da-linha-planejada.md`, G1). O snapshot é lido **antes** de
 * apagar porque é ele que o `restoreTasks` reinsere; o `findById` já hidrata
 * `customValues`, a única parte que o banco apaga em cascata (`task_custom_values`).
 *
 * Id que não existe é omitido, não lança: numa exclusão em lote, uma linha que
 * outra janela já apagou não deve impedir as outras nem o desfazer delas.
 *
 * O `deleteTask` singular fica como está: a API local e o MCP não têm desfazer,
 * e não há por que pagarem a leitura do snapshot.
 */
export async function deleteTasks(repo: ITaskRepository, ids: UUID[]): Promise<Task[]> {
  const snapshots: Task[] = [];
  for (const id of ids) {
    const task = await repo.findById(id);
    if (!task) continue;
    await repo.delete(id);
    snapshots.push(task);
  }
  return snapshots;
}

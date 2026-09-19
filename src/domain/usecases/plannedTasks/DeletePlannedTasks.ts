import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";

/**
 * Exclusão com desfazer (spec `acoes-da-linha-planejada.md`): o snapshot é lido
 * **antes** de apagar porque é ele que o `restorePlannedTasks` reinsere. O
 * `findById` já hidrata `customValues` — a única parte que o banco apaga em
 * cascata junto com a tarefa.
 *
 * Id que não existe é omitido, não lança: numa exclusão em lote, uma linha que
 * outra janela já apagou não deve impedir as outras nem o desfazer delas.
 *
 * O `deletePlannedTask` singular fica como está: a API local e o MCP não têm
 * desfazer, e não há por que pagarem a leitura do snapshot.
 */
export async function deletePlannedTasks(
  repo: IPlannedTaskRepository,
  ids: UUID[]
): Promise<PlannedTask[]> {
  const snapshots: PlannedTask[] = [];
  for (const id of ids) {
    const task = await repo.findById(id);
    if (!task) continue;
    await repo.delete(id);
    snapshots.push(task);
  }
  return snapshots;
}

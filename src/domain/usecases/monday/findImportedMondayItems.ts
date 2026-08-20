import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";

export interface FindImportedMondayItemsDeps {
  trackedRepo: ITrackedMondayItemRepository;
  plannedRepo: IPlannedTaskRepository;
}

/**
 * Dos itens em mãos, quais já viraram planejada que **continua viva**.
 *
 * Importar de novo um item destes criaria a duplicata que o sync automático
 * evita — e pior: o `upsert` do vínculo passaria a apontar para a cópia nova,
 * deixando a planejada original órfã. Nenhum ciclo voltaria a atualizá-la nem a
 * podá-la, e ela sobreviveria ao item ser excluído no Monday.
 *
 * **Vínculo cuja planejada foi apagada à mão fica de fora.** Ali não há
 * duplicata a evitar, e o modal é a única forma de trazer a tarefa de volta: o
 * sync automático nunca recria o que o usuário apagou (§5.7).
 *
 * A existência é conferida só para os itens à vista, e não para todo o
 * rastreamento: a lista de vínculos cresce com o histórico do workspace, a de
 * itens buscados não.
 */
export async function findImportedMondayItems(
  { trackedRepo, plannedRepo }: FindImportedMondayItemsDeps,
  itemIds: string[],
  workspaceId: UUID
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();

  const wanted = new Set(itemIds);
  const tracked = (await trackedRepo.listForWorkspace(workspaceId)).filter((t) =>
    wanted.has(t.mondayItemId)
  );
  if (tracked.length === 0) return new Set();

  const planned = await Promise.all(tracked.map((t) => plannedRepo.findById(t.plannedTaskId)));
  return new Set(tracked.filter((_, i) => planned[i] !== null).map((t) => t.mondayItemId));
}

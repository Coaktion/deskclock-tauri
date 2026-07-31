import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { UUID } from "@shared/types";

/**
 * Exclusão sem confirmação (§1). O `ON DELETE CASCADE` da migration 012 leva
 * junto todos os valores gravados — deixar valores órfãos os manteria compondo
 * a chave de agrupamento de tarefas antigas.
 */
export async function deleteCustomField(
  repository: ICustomFieldRepository,
  id: UUID
): Promise<void> {
  await repository.delete(id);
}

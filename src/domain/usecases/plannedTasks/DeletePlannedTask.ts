import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";

export async function deletePlannedTask(
  repo: IPlannedTaskRepository,
  id: UUID
): Promise<void> {
  await repo.delete(id);
}

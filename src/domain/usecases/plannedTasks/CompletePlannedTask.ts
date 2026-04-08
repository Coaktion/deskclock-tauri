import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";

export async function completePlannedTask(
  repo: IPlannedTaskRepository,
  id: UUID,
  dateISO: string
): Promise<void> {
  await repo.complete(id, dateISO);
}

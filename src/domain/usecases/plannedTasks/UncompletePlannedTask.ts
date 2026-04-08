import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";

export async function uncompletePlannedTask(
  repo: IPlannedTaskRepository,
  id: UUID,
  dateISO: string
): Promise<void> {
  await repo.uncomplete(id, dateISO);
}

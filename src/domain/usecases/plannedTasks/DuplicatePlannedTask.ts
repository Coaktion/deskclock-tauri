import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { generateUUID } from "@shared/utils/uuid";
import type { UUID } from "@shared/types";

export async function duplicatePlannedTask(
  repo: IPlannedTaskRepository,
  id: UUID,
  nowISO: string
): Promise<PlannedTask> {
  const original = await repo.findById(id);
  if (!original) throw new Error(`PlannedTask não encontrada: ${id}`);

  const copy: PlannedTask = {
    ...original,
    id: generateUUID(),
    completedDates: [],
    createdAt: nowISO,
  };
  await repo.save(copy);
  return copy;
}

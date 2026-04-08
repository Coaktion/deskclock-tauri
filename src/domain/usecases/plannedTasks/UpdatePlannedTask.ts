import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";

type UpdatePlannedTaskInput = Partial<{
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  scheduleType: ScheduleType;
  scheduleDate: string | null;
  recurringDays: number[] | null;
  periodStart: string | null;
  periodEnd: string | null;
  actions: PlannedTaskAction[];
  sortOrder: number;
}>;

export async function updatePlannedTask(
  repo: IPlannedTaskRepository,
  id: UUID,
  input: UpdatePlannedTaskInput
): Promise<PlannedTask> {
  const existing = await repo.findById(id);
  if (!existing) throw new Error(`PlannedTask não encontrada: ${id}`);

  const updated: PlannedTask = { ...existing, ...input };
  await repo.update(updated);
  return updated;
}

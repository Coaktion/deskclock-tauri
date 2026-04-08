import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

export async function getPlannedTasksForDate(
  repo: IPlannedTaskRepository,
  dateISO: string
): Promise<PlannedTask[]> {
  return repo.findForDate(dateISO);
}

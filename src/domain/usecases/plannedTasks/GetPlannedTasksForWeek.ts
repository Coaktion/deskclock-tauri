import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

export async function getPlannedTasksForWeek(
  repo: IPlannedTaskRepository,
  startISO: string,
  endISO: string
): Promise<PlannedTask[]> {
  return repo.findForWeek(startISO, endISO);
}

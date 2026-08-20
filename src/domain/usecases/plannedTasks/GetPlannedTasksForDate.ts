import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

/** `workspaceId` omitido devolve as planejadas de todos os workspaces. */
export async function getPlannedTasksForDate(
  repo: IPlannedTaskRepository,
  dateISO: string,
  workspaceId?: string
): Promise<PlannedTask[]> {
  return repo.findForDate(dateISO, workspaceId);
}

import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

/** `workspaceId` omitido devolve as planejadas de todos os workspaces. */
export async function getPlannedTasksForWeek(
  repo: IPlannedTaskRepository,
  startISO: string,
  endISO: string,
  workspaceId?: string
): Promise<PlannedTask[]> {
  return repo.findForWeek(startISO, endISO, workspaceId);
}

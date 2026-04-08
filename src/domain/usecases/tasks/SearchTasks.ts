import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import type { UUID } from "@shared/types";

export interface SearchTasksFilters {
  startISO: string;
  endISO: string;
  name?: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
}

export async function searchTasks(
  repo: ITaskRepository,
  filters: SearchTasksFilters
): Promise<Task[]> {
  const tasks = await repo.findByDateRange(filters.startISO, filters.endISO);

  return tasks.filter((t) => {
    if (t.status !== "completed") return false;
    if (filters.name && !t.name?.toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.projectId !== undefined && t.projectId !== filters.projectId) return false;
    if (filters.categoryId !== undefined && t.categoryId !== filters.categoryId) return false;
    if (filters.billable !== undefined && t.billable !== filters.billable) return false;
    return true;
  });
}

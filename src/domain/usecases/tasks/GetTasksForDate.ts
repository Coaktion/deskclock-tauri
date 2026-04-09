import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { startOfDayISO, endOfDayISO } from "@shared/utils/time";

export async function getTasksForDate(
  repo: ITaskRepository,
  dateISO: string
): Promise<Task[]> {
  return repo.findByDateRange(startOfDayISO(dateISO), endOfDayISO(dateISO));
}

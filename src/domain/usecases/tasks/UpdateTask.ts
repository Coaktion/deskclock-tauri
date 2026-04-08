import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { DomainError } from "@shared/errors";

type UpdateTaskInput = Partial<
  Pick<Task, "name" | "projectId" | "categoryId" | "billable" | "startTime" | "endTime" | "durationSeconds">
>;

export async function updateTask(
  repo: ITaskRepository,
  id: string,
  input: UpdateTaskInput,
  nowISO: string
): Promise<Task> {
  const task = await repo.findById(id);
  if (!task) throw new DomainError(`Task ${id} not found`);

  const updated: Task = { ...task, ...input, updatedAt: nowISO };
  await repo.update(updated);
  return updated;
}

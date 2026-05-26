import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { DomainError } from "@shared/errors";
import { differenceInSeconds } from "./_helpers";

export async function stopTask(
  repo: ITaskRepository,
  id: string,
  endTimeISO: string,
  nowISO: string = endTimeISO,
): Promise<Task> {
  const task = await repo.findById(id);
  if (!task) throw new DomainError(`Task ${id} not found`);
  if (task.status === "completed") throw new DomainError(`Task ${id} is already completed`);

  const accumulated = task.durationSeconds ?? 0;
  const total =
    task.status === "running"
      ? accumulated + Math.max(0, differenceInSeconds(endTimeISO, task.startTime))
      : accumulated;

  const updated: Task = {
    ...task,
    status: "completed",
    endTime: endTimeISO,
    durationSeconds: total,
    updatedAt: nowISO,
  };
  await repo.update(updated);
  return updated;
}

import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { generateUUID } from "@shared/utils/uuid";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import type { UUID } from "@shared/types";

export async function startPlannedTask(
  plannedRepo: IPlannedTaskRepository,
  taskRepo: ITaskRepository,
  plannedTaskId: UUID,
  nowISO: string
): Promise<Task> {
  const planned = await plannedRepo.findById(plannedTaskId);
  if (!planned) throw new Error(`PlannedTask não encontrada: ${plannedTaskId}`);

  const [running, paused] = await Promise.all([
    taskRepo.findByStatus("running"),
    taskRepo.findByStatus("paused"),
  ]);
  await Promise.all(
    [...running, ...paused].map((t) =>
      taskRepo.update({
        ...t,
        status: "completed",
        endTime: nowISO,
        durationSeconds: effectiveDuration(t, nowISO),
        updatedAt: nowISO,
      })
    )
  );

  const task: Task = {
    id: generateUUID(),
    name: planned.name,
    projectId: planned.projectId,
    categoryId: planned.categoryId,
    billable: planned.billable,
    startTime: nowISO,
    endTime: null,
    durationSeconds: 0,
    status: "running",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  await taskRepo.save(task);
  return task;
}

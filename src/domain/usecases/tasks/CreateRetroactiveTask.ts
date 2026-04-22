import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { generateUUID } from "@shared/utils/uuid";

interface CreateRetroactiveInput {
  name: string | null;
  projectId: string | null;
  categoryId: string | null;
  billable: boolean;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

export async function createRetroactiveTask(
  repo: ITaskRepository,
  input: CreateRetroactiveInput,
  nowISO: string
): Promise<Task> {
  const task: Task = {
    id: generateUUID(),
    name: input.name,
    projectId: input.projectId,
    categoryId: input.categoryId,
    billable: input.billable,
    startTime: input.startTime,
    endTime: input.endTime,
    durationSeconds: input.durationSeconds,
    status: "completed",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  await repo.save(task);
  return task;
}

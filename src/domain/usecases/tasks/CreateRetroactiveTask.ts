import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { generateUUID } from "@shared/utils/uuid";

interface CreateRetroactiveInput {
  workspaceId: string;
  name: string | null;
  projectId: string | null;
  categoryId: string | null;
  billable: boolean;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  customValues?: CustomValues;
}

export async function createRetroactiveTask(
  repo: ITaskRepository,
  input: CreateRetroactiveInput,
  nowISO: string
): Promise<Task> {
  const task: Task = {
    id: generateUUID(),
    workspaceId: input.workspaceId,
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
    customValues: input.customValues ?? {},
  };
  await repo.save(task);
  return task;
}

import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { generateUUID } from "@shared/utils/uuid";
import { effectiveDuration } from "./_helpers";

interface StartTaskInput {
  workspaceId: string;
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable: boolean;
  startTime?: string;
  customValues?: CustomValues;
}

export async function startTask(
  repo: ITaskRepository,
  input: StartTaskInput,
  nowISO: string
): Promise<Task> {
  const [running, paused] = await Promise.all([
    repo.findByStatus("running"),
    repo.findByStatus("paused"),
  ]);
  const active = [...running, ...paused];
  await Promise.all(
    active.map((t) =>
      repo.update({
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
    workspaceId: input.workspaceId,
    name: input.name ?? null,
    projectId: input.projectId ?? null,
    categoryId: input.categoryId ?? null,
    billable: input.billable,
    startTime: input.startTime ?? nowISO,
    endTime: null,
    durationSeconds: 0,
    status: "running",
    createdAt: nowISO,
    updatedAt: nowISO,
    customValues: input.customValues ?? {},
  };
  await repo.save(task);
  return task;
}

import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { generateUUID } from "@shared/utils/uuid";

export async function mergeTaskGroup(
  repo: ITaskRepository,
  tasks: Task[],
  nowISO: string
): Promise<Task> {
  const first = tasks[0];
  const totalSeconds = tasks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);
  const earliest = tasks.reduce(
    (min, t) => (t.startTime < min ? t.startTime : min),
    tasks[0].startTime
  );

  const merged: Task = {
    id: generateUUID(),
    // O grupo só existe dentro de um workspace, então herdar da primeira é seguro.
    workspaceId: first.workspaceId,
    name: first.name,
    projectId: first.projectId,
    categoryId: first.categoryId,
    billable: first.billable,
    startTime: earliest,
    endTime: nowISO,
    durationSeconds: totalSeconds,
    status: "completed",
    createdAt: nowISO,
    updatedAt: nowISO,
    // Os custom values compõem a chave do grupo, então todas as tarefas daqui
    // têm exatamente os mesmos: herdar da primeira não escolhe nada.
    customValues: { ...first.customValues },
  };

  await repo.save(merged);
  await repo.deleteMany(tasks.map((t) => t.id));
  return merged;
}

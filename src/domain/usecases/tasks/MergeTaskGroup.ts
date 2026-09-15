import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { addSecondsISO } from "@shared/utils/time";
import { generateUUID } from "@shared/utils/uuid";

/**
 * Fim do registro somado: o maior `endTime` do grupo. Gravar "agora" esticava
 * uma unificação de dia passado até hoje, e mesmo hoje punha na exportação um
 * fim que ninguém registrou. Sem nenhum fim gravado, fecha a conta com a duração.
 */
function mergedEndTime(tasks: Task[], earliest: string, totalSeconds: number): string {
  const ends = tasks
    .map((t) => t.endTime)
    .filter((end): end is string => Boolean(end))
    .map((end) => new Date(end).getTime());
  if (ends.length === 0) return addSecondsISO(earliest, totalSeconds);
  return new Date(Math.max(...ends)).toISOString();
}

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
    endTime: mergedEndTime(tasks, earliest, totalSeconds),
    durationSeconds: totalSeconds,
    status: "completed",
    createdAt: nowISO,
    updatedAt: nowISO,
    // Sem `plannedTaskId`: a origem não compõe a chave do grupo, então as tarefas
    // mescladas podem ter vindo de planejadas diferentes (ou de nenhuma), e herdar
    // a da primeira afirmaria uma origem que o registro somado não tem.
    // Os custom values compõem a chave do grupo, então todas as tarefas daqui
    // têm exatamente os mesmos: herdar da primeira não escolhe nada.
    customValues: { ...first.customValues },
  };

  await repo.save(merged);
  await repo.deleteMany(tasks.map((t) => t.id));
  return merged;
}

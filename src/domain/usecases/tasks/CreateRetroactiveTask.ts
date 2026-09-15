import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { DomainError } from "@shared/errors";
import { generateUUID } from "@shared/utils/uuid";

/**
 * Trava do Lançamento Manual. Mora no domínio para a tela e a API local
 * recusarem o mesmo registro com a mesma mensagem, sem cada uma repetir a regra.
 */
export const MIN_RETROACTIVE_DURATION_SECONDS = 60;

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
  if (input.durationSeconds < MIN_RETROACTIVE_DURATION_SECONDS) {
    throw new DomainError("A duração mínima é 1 minuto.");
  }
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

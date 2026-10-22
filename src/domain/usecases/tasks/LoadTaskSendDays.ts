import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { TaskValidationResult } from "@domain/integrations/taskValidation";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import { groupTasksByDay, type DayGroup } from "@domain/utils/groupTasksByDay";

export interface TaskSendDays {
  dayGroups: DayGroup[];
  /** Ids já marcados como enviados a esta integração no período. */
  sentIds: Set<string>;
}

/**
 * O que a lista de envio mostra: as tarefas **concluídas** do período no
 * workspace da integração, por dia e por grupo, e o que já foi enviado.
 *
 * Só o workspace da integração. Antes a busca era sem escopo, de propósito —
 * "integrações enxergam tudo" —, e a lista oferecia ao board do cliente as
 * horas do trabalho pessoal.
 */
export async function loadTaskSendDays(
  taskRepo: ITaskRepository,
  logRepo: ITaskIntegrationLogRepository,
  integrationId: string,
  workspaceId: string,
  startISO: string,
  endISO: string
): Promise<TaskSendDays> {
  const [tasks, sentIds] = await Promise.all([
    taskRepo.findByDateRange(startISO, endISO, workspaceId),
    logRepo.findSentIds(integrationId, startISO, endISO),
  ]);
  return {
    dayGroups: groupTasksByDay(tasks.filter((t) => t.status === "completed")),
    sentIds: new Set(sentIds),
  };
}

export type GroupSendState = "sent" | "pending" | "invalid";

export interface GroupSendStatus {
  /**
   * `invalid`: falta dado e o grupo não pode ser escolhido. `sent`: todas as
   * tarefas já foram enviadas. `pending`: o resto — é o que a lista pré-seleciona.
   */
  state: GroupSendState;
  /** Campos faltando (pt-BR), só em `invalid`. */
  missing: string[];
  /** Parte do grupo já foi enviada (o "Parcial" da lista); só em `pending`. */
  partiallySent: boolean;
}

/** A validação é da primeira tarefa: o grupo compartilha nome, projeto e categoria. */
export function groupSendStatus(
  group: TaskGroup,
  sentIds: Set<string>,
  validateTask: (task: Task) => TaskValidationResult
): GroupSendStatus {
  const validation = validateTask(group.tasks[0]);
  if (!validation.ok)
    return { state: "invalid", missing: validation.missing, partiallySent: false };
  if (group.tasks.every((t) => sentIds.has(t.id))) {
    return { state: "sent", missing: [], partiallySent: false };
  }
  return {
    state: "pending",
    missing: [],
    partiallySent: group.tasks.some((t) => sentIds.has(t.id)),
  };
}

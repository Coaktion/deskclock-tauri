import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { ITaskSender, TaskSendOutcome } from "@domain/integrations/ITaskSender";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import { resolveSentTasks, type SentResolution } from "@domain/utils/resolveSentTasks";
import { sendTasks } from "./SendTasks";

/** O que o envio manual precisa saber de uma integração. Montado por quem conhece a config. */
export interface TaskSendTarget {
  /** Chave do log de envio (`markSent`/`findSentIds`). */
  integrationId: string;
  /** Null quando a integração não está configurada. */
  sender: ITaskSender | null;
  /**
   * Envia as tarefas cruas em vez de um registro unificado por grupo. Para
   * integrações idempotentes, que precisam de todos os ids do grupo para
   * reencontrar o registro já criado no destino.
   */
  sendsRawTasks?: boolean;
  /** Validação da carga imediatamente antes de enviar (ex.: campos obrigatórios do Sheets). */
  validateBeforeSend?: (tasks: Task[]) => string | null;
  /** Depois de um envio limpo: avança o timestamp do envio diário. */
  onSendSuccess: (taskIds: string[]) => Promise<void>;
}

/** Cru, ou um representante por grupo (a primeira tarefa, com a duração somada). */
export function buildSendPayload(groups: TaskGroup[], sendsRawTasks: boolean): Task[] {
  return sendsRawTasks
    ? groups.flatMap((g) => g.tasks)
    : groups.map((g) => ({ ...g.tasks[0], durationSeconds: g.totalSeconds }));
}

/** O motivo pelo qual a carga destes grupos não pode subir, ou null. */
export function sendBlockedReason(target: TaskSendTarget, groups: TaskGroup[]): string | null {
  if (!target.validateBeforeSend) return null;
  return target.validateBeforeSend(buildSendPayload(groups, !!target.sendsRawTasks));
}

export type SendTaskGroupsResult =
  | { kind: "blocked"; message: string }
  | { kind: "sent"; outcome: TaskSendOutcome; sent: SentResolution };

/**
 * Envio manual de grupos inteiros: a regra do modal de envio, fora dele para
 * que a API local não tenha uma segunda cópia.
 *
 * Lança `NoIntegrationError`/`NoTasksSelectedError` (de `sendTasks`); recusa e
 * falha por grupo voltam no `outcome`.
 */
export async function sendTaskGroups(
  target: TaskSendTarget,
  groups: TaskGroup[],
  logRepo: ITaskIntegrationLogRepository
): Promise<SendTaskGroupsResult> {
  const blocked = sendBlockedReason(target, groups);
  if (blocked) return { kind: "blocked", message: blocked };

  const sendsRaw = !!target.sendsRawTasks;
  const outcome = await sendTasks(target.sender, buildSendPayload(groups, sendsRaw));

  // O sender só devolve ids; quem conhece o agrupamento é quem montou a carga.
  // A expansão decide o que recebe o badge "Enviado" — e o badge é o que impede
  // o reenvio.
  const sent = resolveSentTasks(groups, outcome.sentTaskIds, sendsRaw);
  if (sent.taskIds.length > 0) {
    await logRepo.markSent(sent.taskIds, target.integrationId);
  }

  // O timestamp do envio diário é onde a janela do próximo ciclo começa:
  // avançá-lo com algo recusado faria o grupo que ficou para trás sair da
  // janela e nunca mais ser tentado sozinho.
  if (outcome.refused.length + outcome.failed.length === 0 && sent.taskIds.length > 0) {
    await target.onSendSuccess(sent.taskIds);
  }

  return { kind: "sent", outcome, sent };
}

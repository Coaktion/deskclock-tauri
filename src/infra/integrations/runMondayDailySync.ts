import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import { groupTasksForMonday } from "@domain/usecases/monday/groupTasksForMonday";
import { calcDailyRange } from "./runDailyTemplate";

export const MONDAY_LOG_KEY = "monday";

export interface MondayDailySyncDeps {
  integrationName: string;
  taskRepo: ITaskRepository;
  logRepo: ITaskIntegrationLogRepository;
  /**
   * Workspace do DeskClock da integração. Sem ele a busca devolveria as tarefas
   * de **todos** os workspaces, e o board do cliente receberia hora de trabalho
   * pessoal.
   */
  workspaceId: string;
  timestampPort: {
    get(): string;
    set(iso: string): Promise<void>;
  };
  validate: (task: Task) => boolean;
  createSender: () => Promise<ITaskSender> | ITaskSender;
  nowISO?: () => string;
}

/**
 * Envio diário ao Monday.
 *
 * Não reusa `runDailyTemplate` por uma diferença de contrato: lá as tarefas já
 * enviadas são excluídas **antes** do agrupamento, para não somar duas vezes o
 * que já está na planilha. Aqui o envio é um upsert por grupo — o sender precisa
 * do **total absoluto** do grupo no dia para atualizar o item existente.
 * Excluir as já enviadas produziria um item com duração parcial.
 *
 * As tarefas são entregues **cruas** ao sender, que unifica internamente: é ele
 * quem precisa conhecer todos os ids de cada grupo para reencontrar o item.
 *
 * O `markSent` continua sendo feito, mas só alimenta os badges de "já enviada"
 * na UI; a decisão de criar, atualizar ou pular é do store de idempotência.
 * Só marca o que o `validate` aprovou — tarefas sem board mapeado são puladas
 * pelo sender e não podem receber o badge.
 */
export async function runMondayDailySync(
  deps: MondayDailySyncDeps,
  endDateISO: string
): Promise<AutoSyncResult> {
  const range = calcDailyRange(deps.timestampPort.get(), endDateISO);
  if (!range) return { integration: deps.integrationName, count: 0 };

  try {
    const tasks = await deps.taskRepo.findByDateRange(range.start, range.end, deps.workspaceId);
    const allCompleted = tasks.filter((t) => t.status === "completed");
    const valid = allCompleted.filter(deps.validate);
    const invalidCount = allCompleted.length - valid.length;
    const warning =
      invalidCount > 0
        ? `${invalidCount} tarefa(s) ignorada(s) no envio diário ao Monday: ` +
          `dados incompletos ou projeto sem board mapeado.`
        : undefined;

    if (valid.length === 0) return { integration: deps.integrationName, count: 0, warning };

    // Mesmo agrupamento que o sender aplica internamente — usado só para reportar
    // quantos itens o envio representa. Compartilhar o cálculo evita que a
    // contagem exibida divirja do que de fato foi escrito no Monday.
    const groups = groupTasksForMonday(valid);

    const sender = await deps.createSender();
    await sender.send(valid);
    await deps.logRepo.markSent(
      valid.map((t) => t.id),
      MONDAY_LOG_KEY
    );
    await deps.timestampPort.set((deps.nowISO ?? (() => new Date().toISOString()))());

    return { integration: deps.integrationName, count: groups.length, warning };
  } catch (err) {
    return {
      integration: deps.integrationName,
      count: 0,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

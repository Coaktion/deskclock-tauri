import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import { groupTasks } from "@domain/utils/groupTasks";
import { addDaysISO, todayISO, startOfDayISO, endOfDayISO, localDateISO } from "@shared/utils/time";

export interface DailyTemplateDeps {
  integrationName: string;
  integrationLabel: string;
  logKey: string;
  taskRepo: ITaskRepository;
  logRepo: ITaskIntegrationLogRepository;
  /**
   * Workspace do DeskClock da integração. Sem ele a busca devolveria as tarefas
   * de **todos** os workspaces — o envio levaria junto o trabalho pessoal.
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

export function calcDailyRange(
  lastTimestamp: string,
  endDateISO: string
): { start: string; end: string } | null {
  const startDateISO = lastTimestamp
    ? new Date(lastTimestamp).toLocaleDateString("sv-SE")
    : addDaysISO(todayISO(), -7);
  if (startDateISO > endDateISO) return null;
  return { start: startOfDayISO(startDateISO), end: endOfDayISO(endDateISO) };
}

export async function runDailyTemplate(
  deps: DailyTemplateDeps,
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
        ? `${invalidCount} tarefa(s) ignorada(s) no envio diário ao ${deps.integrationLabel}: dados incompletos.`
        : undefined;

    if (valid.length === 0) return { integration: deps.integrationName, count: 0, warning };

    const sentIds = new Set(await deps.logRepo.findSentIds(deps.logKey, range.start, range.end));
    // Exclui já enviadas ANTES de agrupar: um grupo parcialmente enviado re-somaria
    // durações que já estão na planilha (double-count).
    const unsent = valid.filter((t) => !sentIds.has(t.id));
    if (unsent.length === 0) return { integration: deps.integrationName, count: 0, warning };

    // Agrupa por dia local (§6.6) antes da chave nome|projeto|categoria — o range pode
    // cobrir mais de um dia e tarefas de dias distintos não podem se fundir num registro só.
    const byDay = new Map<string, Task[]>();
    for (const t of unsent) {
      const day = localDateISO(t.startTime);
      const list = byDay.get(day);
      if (list) list.push(t);
      else byDay.set(day, [t]);
    }
    const groups = [...byDay.values()].flatMap((dayTasks) => groupTasks(dayTasks));

    const tasksToSend = groups.map((g) => ({
      ...g.tasks[0],
      durationSeconds: g.totalSeconds,
    }));
    const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id));

    const sender = await deps.createSender();
    await sender.send(tasksToSend);
    await deps.logRepo.markSent(allIds, deps.logKey);
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

import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import { groupTasks } from "@domain/utils/groupTasks";
import { addDaysISO, todayISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";

export interface DailyTemplateDeps {
  integrationName: string;
  integrationLabel: string;
  logKey: string;
  taskRepo: ITaskRepository;
  logRepo: ITaskIntegrationLogRepository;
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
  const lastDateISO = lastTimestamp
    ? new Date(lastTimestamp).toLocaleDateString("sv-SE")
    : addDaysISO(todayISO(), -7);
  const startDateISO = addDaysISO(lastDateISO, 1);
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
    const tasks = await deps.taskRepo.findByDateRange(range.start, range.end);
    const allCompleted = tasks.filter((t) => t.status === "completed");
    const valid = allCompleted.filter(deps.validate);
    const invalidCount = allCompleted.length - valid.length;
    const warning =
      invalidCount > 0
        ? `${invalidCount} tarefa(s) ignorada(s) no envio diário ao ${deps.integrationLabel}: dados incompletos.`
        : undefined;

    if (valid.length === 0) return { integration: deps.integrationName, count: 0, warning };

    const sentIds = new Set(
      await deps.logRepo.findSentIds(deps.logKey, range.start, range.end)
    );
    const groups = groupTasks(valid).filter(
      (g) => !g.tasks.every((t) => sentIds.has(t.id))
    );
    if (groups.length === 0) return { integration: deps.integrationName, count: 0, warning };

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

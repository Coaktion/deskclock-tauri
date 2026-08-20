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

/**
 * Como reportar, no envio **diário**, o que ficou de fora do ciclo.
 *
 * São três origens e só dois canais no `AutoSyncResult`: as tarefas ignoradas
 * por dados incompletos e a **recusa** por grupo vão juntas no `warning` — o
 * ciclo funcionou e parte das horas subiu —, enquanto a **falha técnica** vira
 * `error`, porque é o que pede nova tentativa em vez de edição. Compartilhado
 * com `runMondayDailySync`, que tem o mesmo par.
 */
export function dailySendFeedback(
  base: string | undefined,
  outcome: { refused: string[]; failed: string[] },
  integrationLabel: string
): { warning?: string; error?: Error } {
  const parts = [base];
  if (outcome.refused.length > 0) {
    parts.push(
      `${outcome.refused.length} grupo(s) não enviado(s) ao ${integrationLabel}: ${outcome.refused.join(" ")}`
    );
  }
  const warning = parts.filter(Boolean).join(" ") || undefined;
  const error =
    outcome.failed.length > 0
      ? new Error(`Falha ao enviar ao ${integrationLabel}: ${outcome.failed.join(" ")}`)
      : undefined;
  return { warning, error };
}

/**
 * Como reportar, no envio **por tarefa**, o que a integração não confirmou.
 *
 * Compartilhado pelas três estratégias (§9.4): elas diferiam só no rótulo. A
 * separação entre os dois campos vira a separação entre os dois canais do
 * `AutoSyncResult` — `warning` (amarelo) para recusa, `error` (vermelho) para
 * falha técnica —, que é o que o `usePostStopLogic` já sabe exibir.
 *
 * O fallback não é enfeite: as duas listas podem voltar vazias (o sender filtra
 * a tarefa não concluída antes de planejar qualquer grupo) e a frase terminaria
 * em dois-pontos soltos.
 */
export function taskSendFeedback(
  integrationLabel: string,
  outcome: { refused: string[]; failed: string[] }
): { warning?: string; error?: Error } {
  const result: { warning?: string; error?: Error } = {};
  if (outcome.failed.length > 0) {
    result.error = new Error(`Falha ao enviar ao ${integrationLabel}: ${outcome.failed.join(" ")}`);
  }
  if (outcome.refused.length > 0) {
    result.warning = `Tarefa não enviada ao ${integrationLabel}: ${outcome.refused.join(" ")}`;
  }
  if (!result.error && !result.warning) {
    result.warning = `Tarefa não enviada ao ${integrationLabel}: motivo não informado pela integração.`;
  }
  return result;
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

    const sender = await deps.createSender();
    const outcome = await sender.send(tasksToSend);

    // O sender viu um representante por grupo, então devolve o id do
    // representante — quem sabe expandir para o grupo inteiro é quem agrupou.
    // Marcar `allIds` cru daria o badge "enviado" a tarefas de grupos que não
    // subiram.
    const sentReps = new Set(outcome.sentTaskIds);
    const sentGroups = groups.filter((g) => sentReps.has(g.tasks[0].id));
    const sentIdsToMark = sentGroups.flatMap((g) => g.tasks.map((t) => t.id));

    if (sentIdsToMark.length > 0) {
      await deps.logRepo.markSent(sentIdsToMark, deps.logKey);
    }

    // **O timestamp só avança com o envio limpo** — recusado ou falho, tanto
    // faz. `calcDailyRange` deriva o início da janela do dia local dele, então
    // avançá-lo com algo pendente tiraria o grupo que ficou para trás da janela
    // do ciclo seguinte — ele nunca mais seria tentado, sem badge e sem aviso.
    // Ficar parado só alarga a janela enquanto houver pendência, e as já
    // enviadas são excluídas antes de agrupar (acima), então não há reenvio
    // duplicado.
    const pending = outcome.refused.length + outcome.failed.length;
    if (pending === 0 && sentIdsToMark.length > 0) {
      await deps.timestampPort.set((deps.nowISO ?? (() => new Date().toISOString()))());
    }

    return {
      integration: deps.integrationName,
      count: sentGroups.length,
      ...dailySendFeedback(warning, outcome, deps.integrationLabel),
    };
  } catch (err) {
    return {
      integration: deps.integrationName,
      count: 0,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

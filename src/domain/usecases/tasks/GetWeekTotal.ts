import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { endOfDayISO, localDateISO, startOfDayISO } from "@shared/utils/time";

interface WeekTotal {
  totalSeconds: number;
  daysWorked: number;
}

/**
 * `workspaceId` omitido soma as tarefas de todos os workspaces.
 *
 * Os limites e o dia de cada tarefa saem do fuso local, nunca do ISO em UTC
 * (§6.6). Montar a borda como `${data}T00:00:00.000Z` fazia a semana começar à
 * meia-noite UTC: em UTC−3 ela abria às 21h de domingo e fechava às 21h do
 * domingo seguinte, engolindo três horas de um dia e perdendo três do outro.
 * Pelo mesmo motivo `daysWorked` usa `localDateISO` em vez de recortar os dez
 * primeiros caracteres do ISO — uma tarefa iniciada às 22h contava no dia
 * seguinte e inflava o número de dias trabalhados.
 */
export async function getWeekTotal(
  repo: ITaskRepository,
  weekStartDate: string,
  weekEndDate: string,
  workspaceId?: string
): Promise<WeekTotal> {
  const tasks = await repo.findByDateRange(
    startOfDayISO(weekStartDate),
    endOfDayISO(weekEndDate),
    workspaceId
  );

  let totalSeconds = 0;
  const days = new Set<string>();
  for (const t of tasks) {
    totalSeconds += t.durationSeconds ?? 0;
    days.add(localDateISO(t.startTime));
  }
  return { totalSeconds, daysWorked: days.size };
}

import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { getHistoryTotals } from "@domain/usecases/tasks/GetHistoryTotals";
import { getWeekTotal } from "@domain/usecases/tasks/GetWeekTotal";
import { weekBoundsOf } from "@shared/utils/time";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiHandler } from "../types";
import { assertDate, periodRange } from "../period";

/** Os mesmos totais do Histórico: só tarefas concluídas do período. */
export const getPeriodTotals: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const { from, to, startISO, endISO } = periodRange(deps, params);
  const tasks = await searchTasks(deps.taskRepo, { startISO, endISO, workspaceId });
  return { status: 200, body: { from, to, ...getHistoryTotals(tasks) } };
};

/** A semana da config `weekStartsOn`, como o total da tela de Tarefas. */
export const getWeekTotals: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const date = params.date || deps.todayISO();
  assertDate(date, "date");
  const { start, end } = weekBoundsOf(date, deps.weekStartsOn());
  const total = await getWeekTotal(deps.taskRepo, start, end, workspaceId);
  return { status: 200, body: { weekStart: start, weekEnd: end, ...total } };
};

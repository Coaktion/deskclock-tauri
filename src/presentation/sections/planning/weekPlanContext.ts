import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { ExistingPlannedLine, WeekPlanDay } from "@domain/usecases/llm/buildWeekPlanPrompt";

/**
 * Os nomes por extenso, na escala do `Date` (0=Dom…6=Sáb).
 *
 * Por extenso e não abreviados porque quem os lê é o modelo, e o pedido vem
 * escrito assim: "toda segunda", "na quinta". "Seg" é abreviação de tela.
 */
const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/** O dia da semana de uma data ISO, no mesmo meio-dia UTC que a tela usa. */
function weekdayOf(dateISO: string): string {
  return WEEKDAY_NAMES[new Date(dateISO + "T12:00:00Z").getUTCDay()];
}

/** Os dias úteis da semana navegada, como o prompt os apresenta. */
export function weekPlanDays(visibleDays: string[]): WeekPlanDay[] {
  return visibleDays.map((dateISO) => ({ dateISO, weekday: weekdayOf(dateISO) }));
}

/**
 * Quando uma planejada acontece, em uma linha.
 *
 * É texto para o modelo, não para a tela: ele precisa reconhecer "toda segunda e
 * quarta" no que já existe para não propor de novo o que o usuário acabou de
 * pedir na semana passada.
 */
function whenOf(task: PlannedTask): string {
  if (task.scheduleType === "recurring") {
    const days = (task.recurringDays ?? []).map((day) => WEEKDAY_NAMES[day]).filter(Boolean);
    return days.length > 0 ? `toda ${days.join(" e ")}` : "sem dia definido";
  }
  if (task.scheduleType === "period") {
    return `de ${task.periodStart ?? "?"} a ${task.periodEnd ?? "?"}`;
  }
  return task.scheduleDate ? `${weekdayOf(task.scheduleDate)} (${task.scheduleDate})` : "sem data";
}

/**
 * O que a semana já tem, para o pedido poder ser incremental.
 *
 * **Tarefa sem nome fica de fora**: ela não diz nada ao modelo e ainda gasta uma
 * linha do prompt.
 */
export function existingPlanLines(tasks: PlannedTask[]): ExistingPlannedLine[] {
  return tasks
    .filter((task) => task.name.trim() !== "")
    .map((task) => ({ name: task.name.trim(), when: whenOf(task) }));
}

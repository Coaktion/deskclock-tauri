import type { PlannedTask } from "@domain/entities/PlannedTask";

/**
 * As planejadas que ainda faltam no dia — concluir uma planejada não a apaga,
 * marca a data em `completedDates` (§6).
 *
 * Existe porque a tela de Tarefas passou a decidir **arranjo** por esta conta:
 * sem pendentes, a faixa de KPI ocupa a largura toda em vez de dividir a linha
 * com a lista. Com o filtro escrito duas vezes, a lista some e o arranjo não —
 * ou o contrário.
 */
export function pendingPlannedTasks(tasks: PlannedTask[], dateISO: string): PlannedTask[] {
  return tasks.filter((task) => !task.completedDates.includes(dateISO));
}

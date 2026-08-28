import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { WeekPlanDraft } from "@domain/usecases/llm/PlanWeek";
import { createPlannedTask } from "./CreatePlannedTask";

/**
 * Cria as planejadas do plano da semana, a partir dos rascunhos que o usuário
 * revisou.
 *
 * **É aqui, e só aqui, que o plano vira dado.** O `planWeek` lê e propõe; nada
 * do que ele devolve toca o banco antes de passar pela revisão e por esta
 * função. A separação é o que sustenta a regra da integração de LLM: o modelo
 * propõe, a pessoa decide.
 *
 * Recebe `WeekPlanDraft` — o **mesmo** objeto que a revisão edita, e não um
 * gêmeo. Um tipo paralelo aqui divergiria do outro no primeiro campo novo, e
 * divergiria calado.
 *
 * Devolve as criadas **na ordem das entradas**, como o `importCalendarEvents` e
 * o `importMondayItems`. Quem emite `PLANNED_TASKS_CHANGED` é quem chama —
 * `domain/` não conhece o barramento de eventos.
 */
export async function importWeekPlan(
  repo: IPlannedTaskRepository,
  drafts: WeekPlanDraft[],
  nowISO: string,
  workspaceId: string
): Promise<PlannedTask[]> {
  const created: PlannedTask[] = [];
  for (const draft of drafts) {
    created.push(
      await createPlannedTask(
        repo,
        {
          workspaceId,
          name: draft.name,
          projectId: draft.projectId,
          categoryId: draft.categoryId,
          billable: draft.billable,
          scheduleType: draft.scheduleType,
          scheduleDate: draft.scheduleDate,
          recurringDays: draft.recurringDays,
          startTime: draft.startTime,
          endTime: draft.endTime,
        },
        nowISO
      )
    );
  }
  return created;
}

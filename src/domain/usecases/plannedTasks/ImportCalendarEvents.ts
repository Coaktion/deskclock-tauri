import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { UUID } from "@shared/types";
import { createPlannedTask } from "./CreatePlannedTask";

export interface ImportEventInput {
  event: CalendarEvent;
  projectId: UUID | null;
  categoryId: UUID | null;
  scheduleType: "specific_date" | "recurring";
  /** Dias da semana (0=Dom…6=Sáb) — usado quando scheduleType é "recurring" */
  recurringDays: number[];
}

/**
 * Cria PlannedTasks a partir dos eventos selecionados e configurados pelo usuário.
 * Retorna o número de tarefas criadas.
 */
export async function importCalendarEvents(
  repo: IPlannedTaskRepository,
  inputs: ImportEventInput[],
  nowISO: string,
): Promise<number> {
  if (inputs.length === 0) return 0;

  for (const { event, projectId, categoryId, scheduleType, recurringDays } of inputs) {
    const isRecurring = scheduleType === "recurring" && recurringDays.length > 0;

    await createPlannedTask(
      repo,
      {
        name: event.title,
        projectId,
        categoryId,
        billable: false,
        scheduleType: isRecurring ? "recurring" : "specific_date",
        scheduleDate: isRecurring ? null : event.date,
        recurringDays: isRecurring ? recurringDays : null,
      },
      nowISO,
    );
  }

  return inputs.length;
}

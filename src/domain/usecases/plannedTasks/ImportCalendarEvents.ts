import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
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
 *
 * Devolve as planejadas criadas **na ordem das entradas** — é isso que permite ao
 * rastreamento de reuniões emparelhar evento e planejada e gravar o vínculo (o
 * mesmo contrato de `importMondayItems`, §9.4).
 */
export async function importCalendarEvents(
  repo: IPlannedTaskRepository,
  inputs: ImportEventInput[],
  nowISO: string,
  workspaceId: string,
  addOpenUrlAction = false
): Promise<PlannedTask[]> {
  const created: PlannedTask[] = [];
  for (const input of inputs) {
    created.push(
      await createPlannedTaskFromEvent(repo, input, nowISO, workspaceId, addOpenUrlAction)
    );
  }
  return created;
}

/** Uma planejada a partir de um evento. É por onde o rastreamento de reuniões entra. */
export async function createPlannedTaskFromEvent(
  repo: IPlannedTaskRepository,
  { event, projectId, categoryId, scheduleType, recurringDays }: ImportEventInput,
  nowISO: string,
  workspaceId: string,
  addOpenUrlAction = false
): Promise<PlannedTask> {
  const isRecurring = scheduleType === "recurring" && recurringDays.length > 0;
  // Na criação o `htmlLink` serve de reserva: a planejada nasceu deste evento, e
  // abrir o evento é melhor que não ter ação nenhuma.
  const action = addOpenUrlAction ? openUrlAction(event.conferenceLink ?? event.htmlLink) : null;

  return createPlannedTask(
    repo,
    {
      workspaceId,
      name: event.title,
      projectId,
      categoryId,
      billable: false,
      scheduleType: isRecurring ? "recurring" : "specific_date",
      scheduleDate: isRecurring ? null : event.date,
      recurringDays: isRecurring ? recurringDays : null,
      actions: action ? [action] : [],
      startTime: event.startTime,
      endTime: event.endTime,
    },
    nowISO
  );
}

/** Ação de abrir uma URL, ou nada quando não há URL. */
export function openUrlAction(url: string | undefined): PlannedTaskAction | null {
  return url ? { type: "open_url", value: url } : null;
}

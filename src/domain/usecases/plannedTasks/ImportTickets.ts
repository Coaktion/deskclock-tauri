import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ZendeskTicket } from "@domain/integrations/ITicketImporter";
import type { UUID } from "@shared/types";
import { openUrlAction } from "@domain/utils/actions";
import { createPlannedTask } from "./CreatePlannedTask";

export interface ImportTicketInput {
  ticket: ZendeskTicket;
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  addOpenUrlAction: boolean;
  scheduleType: "recurring" | "specific_date";
  scheduleDate: string | null;
}

export async function importTickets(
  repo: IPlannedTaskRepository,
  inputs: ImportTicketInput[],
  nowISO: string,
  workspaceId: string
): Promise<number> {
  if (inputs.length === 0) return 0;

  for (const input of inputs) {
    const isRecurring = input.scheduleType === "recurring";
    // Mesmo construtor da Agenda e do Monday: é ele que nomeia a ação pelo
    // destino, e é o que faz o chip dizer "Zendesk" em vez do subdomínio da
    // instância. A guarda de URL vazia vem junto — escrito à mão aqui, um
    // `webUrl` em branco criava uma ação que não abre nada.
    const action = input.addOpenUrlAction ? openUrlAction(input.ticket.webUrl) : null;

    await createPlannedTask(
      repo,
      {
        workspaceId,
        name: input.name,
        projectId: input.projectId,
        categoryId: input.categoryId,
        billable: false,
        scheduleType: isRecurring ? "recurring" : "specific_date",
        scheduleDate: isRecurring ? null : input.scheduleDate,
        recurringDays: isRecurring ? [0, 1, 2, 3, 4, 5, 6] : null,
        actions: action ? [action] : [],
      },
      nowISO
    );
  }

  return inputs.length;
}

import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ZendeskTicket } from "@domain/integrations/ITicketImporter";
import type { UUID } from "@shared/types";
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
  nowISO: string
): Promise<number> {
  if (inputs.length === 0) return 0;

  for (const input of inputs) {
    const isRecurring = input.scheduleType === "recurring";

    await createPlannedTask(
      repo,
      {
        name: input.name,
        projectId: input.projectId,
        categoryId: input.categoryId,
        billable: false,
        scheduleType: isRecurring ? "recurring" : "specific_date",
        scheduleDate: isRecurring ? null : input.scheduleDate,
        recurringDays: isRecurring ? [0, 1, 2, 3, 4, 5, 6] : null,
        actions: input.addOpenUrlAction ? [{ type: "open_url", value: input.ticket.webUrl }] : [],
      },
      nowISO
    );
  }

  return inputs.length;
}

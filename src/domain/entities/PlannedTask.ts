import type { UUID } from "@shared/types";
import type { CustomValues } from "@domain/entities/CustomField";

export type ScheduleType = "specific_date" | "recurring" | "period";

export interface PlannedTaskAction {
  type: "open_url" | "open_file";
  value: string;
}

export interface PlannedTask {
  id: UUID;
  workspaceId: UUID;
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  scheduleType: ScheduleType;
  scheduleDate: string | null; // ISO date YYYY-MM-DD, para specific_date
  recurringDays: number[] | null; // 0=Dom..6=Sáb, para recurring
  periodStart: string | null; // ISO date, para period
  periodEnd: string | null; // ISO date, para period
  completedDates: string[]; // ISO dates em que foi concluída
  actions: PlannedTaskAction[];
  sortOrder: number;
  createdAt: string;
  /** Copiados para a Task ao dar Play — ver `StartPlannedTask`. */
  customValues: CustomValues;
  /** Horário de início "HH:MM" — preenchido quando importado do Google Agenda */
  startTime?: string;
  /** Horário de fim "HH:MM" — preenchido quando importado do Google Agenda */
  endTime?: string;
}

import type { UUID } from "@shared/types";
import type { CustomValues } from "@domain/entities/CustomField";

export type ScheduleType = "specific_date" | "recurring" | "period";

export interface PlannedTaskAction {
  type: "open_url" | "open_file";
  value: string;
  /**
   * Como a ação se chama na tela. **Opcional**, e sem ele o chip volta a
   * derivar o rótulo do próprio valor — hostname na URL, nome do arquivo no
   * caminho —, que é o que toda ação já gravada mostra. A coluna `actions` é
   * JSON, então linha antiga lê com o campo ausente e nada precisa migrar.
   *
   * O que as integrações escrevem aqui é o **destino**, não a entidade: a
   * planejada já nasce com o nome do evento ou do item, e repeti-lo no chip
   * ecoaria, uma linha acima, o nome que o card mostra logo abaixo.
   */
  label?: string;
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
  /**
   * Hora marcada de início, "HH:MM". Ausente = a tarefa não tem hora — é o que
   * separa o compromisso da tarefa que se faz quando der, e é por esse par que
   * `groupPlannedBySchedule` agrupa a lista do overlay.
   *
   * Hoje quem o preenche é só o import da Agenda (`importCalendarEvents`), o que
   * na prática faz "tem hora" coincidir com "veio do calendário" — coincidência,
   * não contrato: a procedência mora nas tabelas de vínculo, e nada aqui deve
   * passar a depender dela.
   */
  startTime?: string;
  /** Hora marcada de fim, "HH:MM" — ver {@link PlannedTask.startTime}. */
  endTime?: string;
}

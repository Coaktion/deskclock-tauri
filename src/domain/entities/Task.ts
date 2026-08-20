import type { UUID } from "@shared/types";
import type { CustomValues } from "@domain/entities/CustomField";

export type TaskStatus = "running" | "paused" | "completed";

export interface Task {
  id: UUID;
  workspaceId: UUID;
  name: string | null;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * PlannedTask de onde esta execução partiu, ou null/ausente quando a tarefa
   * nasceu solta (lançamento retroativo, merge de grupo, início direto).
   *
   * **Opcional**, ao contrário de `customValues` abaixo, e a diferença é o custo
   * do esquecimento: omitir `customValues` colapsa grupos em silêncio, enquanto
   * omitir este campo afirma "não veio de planejada" — que é a verdade em todo
   * lugar que constrói Task sem conhecer origem. Persistido desde a migration 015:
   * antes vivia só em memória, e reabrir o app perdia o vínculo, deixando a
   * planejada pendente depois de parar a tarefa.
   */
  plannedTaskId?: UUID | null;
  /**
   * Campos personalizados, por id do campo. Obrigatório de propósito: é o que
   * faz o compilador apontar todo lugar que constrói uma Task sem decidir o que
   * fazer com os valores — e esquecer um deles significa colapsar grupos
   * silenciosamente em `taskGroupKey`.
   */
  customValues: CustomValues;
}

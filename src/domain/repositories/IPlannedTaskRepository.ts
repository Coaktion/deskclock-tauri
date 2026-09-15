import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";

export interface IPlannedTaskRepository {
  save(task: PlannedTask): Promise<void>;
  update(task: PlannedTask): Promise<void>;
  findById(id: UUID): Promise<PlannedTask | null>;
  /**
   * Todas as planejadas do workspace, sem recorte de data — inclusive a `period`
   * sem `period_start`, que nenhum filtro por dia alcança. Na ordem das listas.
   */
  findAll(workspaceId: UUID): Promise<PlannedTask[]>;
  /** `workspaceId` omitido devolve as planejadas de TODOS os workspaces. */
  findForDate(dateISO: string, workspaceId?: UUID): Promise<PlannedTask[]>;
  /**
   * `workspaceId` omitido devolve as planejadas de TODOS os workspaces.
   *
   * Os limites são **dias** ("AAAA-MM-DD"), nunca instantes: são comparados como
   * texto com `schedule_date`, `period_start` e `period_end`, que são colunas de
   * data. Um instante faz o primeiro dia do intervalo sumir do resultado — a
   * data é prefixo do instante e, como texto, prefixo é *menor* — e ainda desloca
   * o dia em fusos positivos. Foi o que escondia o chip "já existe" do import da
   * Agenda na segunda-feira.
   */
  findForWeek(startDayISO: string, endDayISO: string, workspaceId?: UUID): Promise<PlannedTask[]>;
  complete(id: UUID, dateISO: string): Promise<void>;
  uncomplete(id: UUID, dateISO: string): Promise<void>;
  reorder(ids: UUID[]): Promise<void>;
  delete(id: UUID): Promise<void>;
}

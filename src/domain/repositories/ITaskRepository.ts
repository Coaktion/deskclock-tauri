import type { Task } from "@domain/entities/Task";
import type { UUID } from "@shared/types";

export interface ITaskRepository {
  save(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  findById(id: UUID): Promise<Task | null>;
  findByStatus(status: "running" | "paused"): Promise<Task[]>;
  /** `workspaceId` omitido devolve as tarefas de TODOS os workspaces — é o caminho das integrações. */
  findByDateRange(startISO: string, endISO: string, workspaceId?: UUID): Promise<Task[]>;
  /**
   * Dia local (AAAA-MM-DD) do último registro concluído, ou `null` se não houver nenhum.
   *
   * O dia é o do `startTime` no fuso do usuário (§6.6) — não o dia UTC do instante gravado.
   * `workspaceId` omitido olha TODOS os workspaces, como no `findByDateRange`.
   *
   * `options.before` corta o dia local a partir do qual não se olha mais: só entram
   * registros **estritamente anteriores** a ele. É o que sustenta o filtro "Dia anterior"
   * do Histórico, que não é "ontem" — passando hoje, o dia devolvido continua sendo a
   * sexta na segunda de manhã, e continua sendo a sexta mesmo depois de hoje ganhar
   * registros. Opcional: sem ele o método olha tudo, como sempre olhou.
   */
  findLastDayWithCompletedTasks(
    workspaceId?: UUID,
    options?: { before?: string }
  ): Promise<string | null>;
  delete(id: UUID): Promise<void>;
  deleteMany(ids: UUID[]): Promise<void>;
}

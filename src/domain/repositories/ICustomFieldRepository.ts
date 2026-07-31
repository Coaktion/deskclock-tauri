import type { CustomField } from "@domain/entities/CustomField";
import type { UUID } from "@shared/types";

/**
 * Só as **definições** dos campos. Os valores pertencem à tarefa e viajam com
 * ela — `ITaskRepository` e `IPlannedTaskRepository` os carregam e gravam junto
 * com a linha principal.
 */
export interface ICustomFieldRepository {
  findAll(): Promise<CustomField[]>;
  findById(id: UUID): Promise<CustomField | null>;
  findByLabel(label: string): Promise<CustomField | null>;
  save(field: CustomField): Promise<void>;
  update(field: CustomField): Promise<void>;
  /** Apaga o campo e, por CASCADE, todos os valores gravados nas tarefas. */
  delete(id: UUID): Promise<void>;
}

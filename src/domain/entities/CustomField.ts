import type { UUID } from "@shared/types";

export type CustomFieldType = "text" | "multiline" | "select" | "checkbox";

/** Opção de um campo `select`. O `id` é o que fica gravado no valor da tarefa. */
export interface CustomFieldOption {
  id: UUID;
  label: string;
}

/**
 * Campo personalizado da tarefa. **Global**, não escopado por workspace: mover
 * uma tarefa entre workspaces só é viável se o valor sobreviver sem
 * reconciliação (ver `docs/specs/workspaces-custom-fields.md`).
 */
export interface CustomField {
  id: UUID;
  label: string;
  type: CustomFieldType;
  /** Vazio em todos os tipos que não sejam `select`. */
  options: CustomFieldOption[];
  sortOrder: number;
  /** Arquivado some dos formulários, mas os valores já gravados continuam valendo. */
  archived: boolean;
  createdAt: string;
}

/**
 * Valores por campo de uma tarefa, indexados pelo id do campo. Campo ausente e
 * campo com string vazia significam a mesma coisa — "sem valor" —, e é por isso
 * que `taskGroupKey` descarta os vazios antes de compor a chave.
 */
export type CustomValues = Record<UUID, string>;

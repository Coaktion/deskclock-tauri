import type { CustomField } from "@domain/entities/CustomField";
import type { UUID } from "@shared/types";
import type { TaskTextCandidate } from "./types";

/** Projeto ou categoria na forma que o casamento consulta. */
export function namedCandidates(items: { id: UUID; name: string }[]): TaskTextCandidate[] {
  return items.map((item) => ({ id: item.id, label: item.name }));
}

/** Opções de um campo `select` na forma que o casamento consulta. */
export function optionCandidates(field: CustomField): TaskTextCandidate[] {
  return field.options.map((o) => ({ id: o.id, label: o.label }));
}

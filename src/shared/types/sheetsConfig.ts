export type TaskField =
  "date" | "name" | "project" | "category" | "billable" | "startTime" | "endTime" | "duration";

export interface SheetColumn {
  field: TaskField;
  label: string;
  enabled: boolean;
}

export type SheetColumnMapping = SheetColumn[];

export const DEFAULT_COLUMN_MAPPING: SheetColumnMapping = [
  { field: "date", label: "Data", enabled: true },
  { field: "name", label: "Nome", enabled: true },
  { field: "project", label: "Projeto", enabled: true },
  { field: "category", label: "Categoria", enabled: true },
  { field: "billable", label: "Billable", enabled: true },
  { field: "startTime", label: "Início", enabled: true },
  { field: "endTime", label: "Fim", enabled: true },
  { field: "duration", label: "Duração", enabled: true },
];

/** Campos que podem estar vazios numa tarefa — precisam de validação antes do envio */
export const NULLABLE_FIELDS: TaskField[] = ["name", "project", "category"];

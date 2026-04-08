import type { UUID } from "@shared/types";

export type ExportFormat = "csv" | "xlsx" | "json";
export type CsvSeparator = "comma" | "semicolon";
export type DurationFormat = "hh:mm:ss" | "decimal" | "minutes";
export type DateFormat = "iso" | "dd/mm/yyyy";

export interface ExportColumn {
  field: string;
  label: string;
  visible: boolean;
  order: number;
}

export const DEFAULT_COLUMNS: ExportColumn[] = [
  { field: "name",             label: "Nome",         visible: true,  order: 0 },
  { field: "project",          label: "Projeto",      visible: true,  order: 1 },
  { field: "category",         label: "Categoria",    visible: true,  order: 2 },
  { field: "billable",         label: "Billable",     visible: true,  order: 3 },
  { field: "startTime",        label: "Início",       visible: true,  order: 4 },
  { field: "endTime",          label: "Fim",          visible: true,  order: 5 },
  { field: "durationSeconds",  label: "Duração",      visible: true,  order: 6 },
];

export interface ExportProfile {
  id: UUID;
  name: string;
  isDefault: boolean;
  format: ExportFormat;
  separator: CsvSeparator;
  durationFormat: DurationFormat;
  dateFormat: DateFormat;
  columns: ExportColumn[];
}

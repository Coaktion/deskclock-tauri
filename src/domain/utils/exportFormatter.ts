import type {
  ExportProfile,
  DurationFormat,
  DateFormat,
  CsvSeparator,
} from "@domain/entities/ExportProfile";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";

export function formatDuration(seconds: number, format: DurationFormat): string {
  const s = Math.max(0, Math.floor(seconds));
  if (format === "hh:mm:ss") {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
  }
  if (format === "decimal") {
    return (s / 3600).toFixed(2);
  }
  // minutes
  return String(Math.round(s / 60));
}

export function formatDate(isoString: string, format: DateFormat): string {
  if (!isoString) return "";
  const dateISO = isoString.slice(0, 10); // YYYY-MM-DD
  if (format === "iso") return dateISO;
  const [y, m, d] = dateISO.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(isoString: string, format: DateFormat): string {
  if (!isoString) return "";
  const dt = new Date(isoString);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const h = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  if (format === "iso") return `${y}-${mo}-${d} ${h}:${mi}`;
  return `${d}/${mo}/${y} ${h}:${mi}`;
}

type ExportRow = Record<string, string>;

export function buildExportRows(
  tasks: Task[],
  profile: ExportProfile,
  projects: Project[],
  categories: Category[]
): ExportRow[] {
  const visibleCols = [...profile.columns]
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);

  return tasks.map((task) => {
    const project = projects.find((p) => p.id === task.projectId);
    const category = categories.find((c) => c.id === task.categoryId);
    const row: ExportRow = {};

    for (const col of visibleCols) {
      switch (col.field) {
        case "name":
          row[col.label] = task.name ?? "(sem nome)";
          break;
        case "project":
          row[col.label] = project?.name ?? "";
          break;
        case "category":
          row[col.label] = category?.name ?? "";
          break;
        case "billable":
          row[col.label] = task.billable ? "Sim" : "Não";
          break;
        case "startTime":
          row[col.label] = formatDateTime(task.startTime, profile.dateFormat);
          break;
        case "endTime":
          row[col.label] = task.endTime ? formatDateTime(task.endTime, profile.dateFormat) : "";
          break;
        case "durationSeconds":
          row[col.label] = formatDuration(task.durationSeconds ?? 0, profile.durationFormat);
          break;
        default:
          row[col.label] = "";
      }
    }
    return row;
  });
}

export function toCSV(rows: ExportRow[], separator: CsvSeparator): string {
  if (rows.length === 0) return "";
  const sep = separator === "comma" ? "," : ";";
  const headers = Object.keys(rows[0]);

  function escapeCell(value: string): string {
    if (value.includes(sep) || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const lines = [
    headers.map(escapeCell).join(sep),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h] ?? "")).join(sep)),
  ];
  return lines.join("\n");
}

export function toJSON(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ExportFormat, ExportProfile } from "@domain/entities/ExportProfile";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { groupTasks } from "@domain/utils/groupTasks";
import { buildExportRows, toCSV, toJSON } from "@domain/utils/exportFormatter";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import type { UUID } from "@shared/types";

/**
 * A exportação do modal (§5.5), num lugar só: o `ExportModal` e a API local
 * geram o mesmo conteúdo para a mesma entrada.
 */

export interface ExportPeriod {
  /** Dias locais, YYYY-MM-DD, inclusivos. */
  from: string;
  to: string;
  /** Omitido = todos os workspaces (é o que o modal faz hoje). */
  workspaceId?: UUID;
}

export interface ExportCatalogs {
  projects: Project[];
  categories: Category[];
  /** Inclusive arquivados: o valor gravado ainda precisa resolver na coluna. */
  customFields: CustomField[];
}

export interface TaskExport {
  content: string;
  fileName: string;
  format: ExportFormat;
  mimeType: string;
  rowCount: number;
}

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv",
  json: "application/json",
};

/** O perfil escolhido; sem escolha (ou com id que não está na lista), o padrão; sem padrão, o primeiro. */
export function resolveExportProfile(
  profiles: ExportProfile[],
  selectedId?: UUID | null
): ExportProfile | undefined {
  return (
    profiles.find((p) => p.id === selectedId) ?? profiles.find((p) => p.isDefault) ?? profiles[0]
  );
}

/** As tarefas que o "Carregar tarefas" lista: só as concluídas, nos limites do dia local. */
export async function loadTasksForExport(
  repo: ITaskRepository,
  period: ExportPeriod
): Promise<Task[]> {
  return searchTasks(repo, {
    startISO: startOfDayISO(period.from),
    endISO: endOfDayISO(period.to),
    workspaceId: period.workspaceId,
  });
}

/**
 * Tarefas agrupadas geram registro único com duração totalizada (mesmo nome +
 * projeto + categoria + valores personalizados). O registro herda o resto da
 * primeira tarefa do grupo, na ordem em que chegaram.
 */
export function mergeTasksForExport(tasks: Task[]): Task[] {
  return groupTasks(tasks).flatMap((g) =>
    g.tasks.length === 1
      ? g.tasks
      : [
          {
            ...g.tasks[0],
            durationSeconds: g.tasks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0),
          },
        ]
  );
}

/** Formata as tarefas já agrupadas pelo perfil. Não grava nada: salvar e copiar ficam com quem chama. */
export function generateTaskExport(
  tasks: Task[],
  profile: ExportProfile,
  catalogs: ExportCatalogs
): TaskExport {
  const rows = buildExportRows(
    tasks,
    profile,
    catalogs.projects,
    catalogs.categories,
    catalogs.customFields
  );
  const content = profile.format === "json" ? toJSON(rows) : toCSV(rows, profile.separator);
  return {
    content,
    fileName: `export.${profile.format}`,
    format: profile.format,
    mimeType: MIME_TYPES[profile.format],
    rowCount: rows.length,
  };
}

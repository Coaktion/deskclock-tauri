import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { filterProjectBoards } from "./filterProjectBoards";
import { resolveBoardActivitiesColumns } from "./resolveBoardActivitiesColumns";

export interface ImportMondayProjectsInput {
  api: IMondayApi;
  projectRepo: IProjectRepository;
  workspaceId: string;
  /** Pasta "Projetos"; vazio/ausente = sem filtro de pasta. */
  folderId?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportMondayProjectsResult {
  mappings: MondayProjectMapping[];
  /** Boards que não seguem o template de Activities e por isso não viraram projeto. */
  skipped: { boardName: string; reason: string }[];
}

/**
 * Importa os boards da pasta de projetos como Projects do DeskClock e resolve,
 * board a board, onde as horas serão gravadas (grupo Activities + ids de coluna).
 * O schema é cacheado no mapeamento para o envio não precisar consultá-lo.
 */
export async function importMondayProjects({
  api,
  projectRepo,
  workspaceId,
  folderId,
  onProgress,
}: ImportMondayProjectsInput): Promise<ImportMondayProjectsResult> {
  const boards = filterProjectBoards(await api.listBoards(workspaceId), folderId || undefined);

  const mappings: MondayProjectMapping[] = [];
  const skipped: { boardName: string; reason: string }[] = [];

  for (const [index, board] of boards.entries()) {
    onProgress?.(index, boards.length);

    let resolved;
    try {
      resolved = resolveBoardActivitiesColumns(await api.getBoardSchema(board.id));
    } catch (err) {
      skipped.push({
        boardName: board.name,
        reason: err instanceof Error ? err.message : "Falha ao ler o board.",
      });
      continue;
    }

    if (!resolved.ok) {
      skipped.push({
        boardName: board.name,
        reason: `Não encontrado: ${resolved.missing.join(", ")}.`,
      });
      continue;
    }

    const project =
      (await projectRepo.findByName(board.name)) ??
      (await createProject(projectRepo, board.name).catch(() =>
        projectRepo.findByName(board.name)
      ));
    if (!project) {
      skipped.push({ boardName: board.name, reason: "Não foi possível criar o projeto." });
      continue;
    }

    mappings.push({
      deskclockProjectId: project.id,
      mondayBoardId: board.id,
      mondayBoardName: board.name,
      activitiesGroupId: resolved.activitiesGroupId,
      columnIds: resolved.columnIds,
      workspaceId,
    });
  }

  onProgress?.(boards.length, boards.length);
  return { mappings, skipped };
}

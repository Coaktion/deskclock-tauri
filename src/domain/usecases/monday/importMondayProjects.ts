import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import type { MondayBoardRef, MondayBoardSchema } from "@shared/types/monday";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { selectImportBoards, type MondayBoardSelection } from "./selectImportBoards";
import {
  resolveBoardActivitiesColumns,
  parseStatusLabels,
  type ResolveActivitiesResult,
} from "./resolveBoardActivitiesColumns";

export interface ImportMondayProjectsInput extends MondayBoardSelection {
  api: IMondayApi;
  projectRepo: IProjectRepository;
  /** Workspace do **Monday** de onde os boards são lidos. */
  workspaceId: string;
  /** Workspace do **DeskClock** que recebe os projetos importados. */
  deskclockWorkspaceId: string;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportMondayProjectsResult {
  mappings: MondayProjectMapping[];
  /** Boards que não seguem o template de Activities e por isso não viraram projeto. */
  skipped: { boardName: string; reason: string }[];
}

/**
 * O vínculo board ↔ projeto, com o schema cacheado.
 *
 * Os rótulos das duas colunas de status entram aqui porque são eles que viram
 * Categoria e opção de Project Stage; sem o cache, cada tela teria de reconsultar
 * o schema do board só para exibi-los, e o envio não teria como validar o rótulo.
 */
function buildMapping(
  board: MondayBoardRef,
  schema: MondayBoardSchema,
  resolved: Extract<ResolveActivitiesResult, { ok: true }>,
  deskclockProjectId: string,
  workspaceId: string
): MondayProjectMapping {
  const columnById = (id?: string) => schema.columns.find((c) => c.id === id);
  const stageColumn = columnById(resolved.columnIds.projectStage);
  return {
    deskclockProjectId,
    mondayBoardId: board.id,
    mondayBoardName: board.name,
    activitiesGroupId: resolved.activitiesGroupId,
    columnIds: resolved.columnIds,
    activityTypeLabels: parseStatusLabels(columnById(resolved.columnIds.activityType)),
    projectStageLabels: parseStatusLabels(stageColumn),
    projectStageTitle: stageColumn?.title ?? "",
    workspaceId,
  };
}

/**
 * Importa os boards de cliente — mais o board interno vinculado — como Projects
 * do DeskClock e resolve, board a board, onde as horas serão gravadas (grupo
 * Activities + ids de coluna). O schema é cacheado no mapeamento para o envio
 * não precisar consultá-lo.
 */
export async function importMondayProjects({
  api,
  projectRepo,
  workspaceId,
  deskclockWorkspaceId,
  clientsFolderId,
  internalFolderId,
  internalBoardId,
  onProgress,
}: ImportMondayProjectsInput): Promise<ImportMondayProjectsResult> {
  const boards = selectImportBoards(await api.listBoards(workspaceId), {
    clientsFolderId,
    internalFolderId,
    internalBoardId,
  });

  const mappings: MondayProjectMapping[] = [];
  const skipped: { boardName: string; reason: string }[] = [];

  for (const [index, board] of boards.entries()) {
    onProgress?.(index, boards.length);

    let resolved;
    let schema;
    try {
      schema = await api.getBoardSchema(board.id);
      resolved = resolveBoardActivitiesColumns(schema);
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
      (await projectRepo.findByName(board.name, deskclockWorkspaceId)) ??
      (await createProject(projectRepo, board.name, deskclockWorkspaceId).catch(() =>
        projectRepo.findByName(board.name, deskclockWorkspaceId)
      ));
    if (!project) {
      skipped.push({ boardName: board.name, reason: "Não foi possível criar o projeto." });
      continue;
    }

    mappings.push(buildMapping(board, schema, resolved, project.id, workspaceId));
  }

  onProgress?.(boards.length, boards.length);
  return { mappings, skipped };
}

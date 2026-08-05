import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { MondayProjectMapping, MondayProjectScope } from "@shared/types/mondayConfig";
import type { MondayBoardSchema, MondayItem } from "@shared/types/monday";
import { createProject } from "@domain/usecases/projects/CreateProject";
import {
  resolveBoardActivitiesColumns,
  parseStatusLabels,
  type ResolveActivitiesResult,
} from "./resolveBoardActivitiesColumns";
import { parseDropdownLabels } from "./importMondayFieldCatalogs";

/**
 * Colunas do board de Portfólio, hardcodadas de propósito.
 *
 * O resto da integração resolve coluna por título porque os boards de projeto
 * nascem de um template e cada um gera os seus ids. O Portfólio é **um board
 * só**, escolhido por id na configuração: não há variação a acomodar, e
 * resolver por título aqui só criaria a chance de casar com a coluna errada num
 * board de 62 linhas que ninguém mais vai duplicar.
 */
export const PORTFOLIO_OFFER_COLUMN_ID = "color_mm4fzw3r";
export const PORTFOLIO_BOARD_COLUMN_ID = "text_mm5etnn2";

/** Único rótulo de "Oferta" que classifica o projeto como interno. */
const INTERNAL_OFFER_LABEL = "atividades internas";

export interface ImportMondayProjectsInput {
  api: IMondayApi;
  projectRepo: IProjectRepository;
  /** Board que lista os projetos. */
  portfolioBoardId: string;
  /** Workspace do **DeskClock** que recebe os projetos importados. */
  deskclockWorkspaceId: string;
  /**
   * Vínculos já gravados, de onde vem o quadro preenchido à mão. Sem eles, o
   * ciclo seguinte devolveria a `""` todo projeto cuja coluna do Portfólio
   * ainda está vazia.
   */
  existingMappings?: MondayProjectMapping[];
  onProgress?: (done: number, total: number) => void;
}

export interface ImportMondayProjectsResult {
  mappings: MondayProjectMapping[];
  /** Boards de destino que não puderam ser lidos; o projeto existe do mesmo jeito. */
  skipped: { boardName: string; reason: string }[];
}

/** O que o envio precisa saber sobre o board de destino de um projeto. */
export type MondayProjectDestination = Pick<
  MondayProjectMapping,
  | "activitiesGroupId"
  | "reportTypeGroupIds"
  | "columnIds"
  | "activityTypeLabels"
  | "projectStageLabels"
  | "projectStageTitle"
  | "nonBillableReasonLabels"
>;

/** Colunas de um projeto cujo board não foi lido — nada será escrito nele. */
export const NO_DESTINATION: MondayProjectDestination = {
  activitiesGroupId: "",
  reportTypeGroupIds: {},
  columnIds: { reportedHours: "", activityType: "", person: "" },
  activityTypeLabels: [],
  projectStageLabels: [],
  projectStageTitle: "",
  nonBillableReasonLabels: [],
};

function columnText(item: MondayItem, columnId: string): string {
  return item.columnValues.find((c) => c.id === columnId)?.text?.trim() ?? "";
}

/**
 * Como o item se classifica pela coluna "Oferta".
 *
 * `null` = a coluna está vazia e o item **não vira projeto**: é linha que
 * ninguém classificou ainda (2 dos 62 hoje), e adivinhar o escopo escolheria
 * qual conjunto de Activity Type é válido no board — errar ali faz o Monday
 * recusar a mutation inteira.
 */
function resolveScope(offer: string): MondayProjectScope | null {
  if (!offer) return null;
  return offer.toLowerCase() === INTERNAL_OFFER_LABEL ? "interno" : "cliente";
}

/**
 * O board de destino das horas, com a regra de merge do refresh.
 *
 * O remoto ganha quando vem preenchido; **vazio nunca apaga o local**. Sem
 * isso, o id que o usuário digitou à mão seria desfeito no ciclo seguinte, e a
 * varredura diária limparia em massa a referência dos 14 itens que ainda estão
 * sem a coluna preenchida no Monday.
 */
function resolveProjectBoardId(
  item: MondayItem,
  existing: MondayProjectMapping | undefined
): string {
  return columnText(item, PORTFOLIO_BOARD_COLUMN_ID) || (existing?.mondayBoardId ?? "");
}

function buildDestination(
  schema: MondayBoardSchema,
  resolved: Extract<ResolveActivitiesResult, { ok: true }>
): MondayProjectDestination {
  const columnById = (id?: string) => schema.columns.find((c) => c.id === id);
  const stageColumn = columnById(resolved.columnIds.projectStage);
  return {
    activitiesGroupId: resolved.activitiesGroupId,
    reportTypeGroupIds: resolved.reportTypeGroupIds,
    columnIds: resolved.columnIds,
    activityTypeLabels: parseStatusLabels(columnById(resolved.columnIds.activityType)),
    projectStageLabels: parseStatusLabels(stageColumn),
    projectStageTitle: stageColumn?.title ?? "",
    // O motivo é `dropdown`, não `status`: o formato dos rótulos é outro e o
    // parser do status devolveria lista vazia sem erro nenhum para avisar.
    nonBillableReasonLabels: parseDropdownLabels(columnById(resolved.columnIds.nonBillableReason)),
  };
}

/**
 * Lê o board de destino e devolve o que o envio precisa saber dele.
 *
 * Os rótulos das duas colunas de status entram no mapeamento porque são eles
 * que viram Categoria e opção de Project Stage; sem o cache, cada tela teria de
 * reconsultar o schema só para exibi-los, e o envio não teria como validar o
 * rótulo antes de mandar.
 *
 * Nunca lança: board ilegível devolve destino vazio mais o motivo, porque tanto
 * a varredura de 62 itens quanto o campo digitado à mão precisam seguir em pé
 * quando um board não abre.
 */
export async function resolveProjectDestination(
  api: IMondayApi,
  boardId: string
): Promise<{ destination: MondayProjectDestination; failure?: string }> {
  if (!boardId) return { destination: NO_DESTINATION };
  try {
    const schema = await api.getBoardSchema(boardId);
    const resolved = resolveBoardActivitiesColumns(schema);
    if (!resolved.ok) {
      return {
        destination: NO_DESTINATION,
        failure: `Não encontrado: ${resolved.missing.join(", ")}.`,
      };
    }
    return { destination: buildDestination(schema, resolved) };
  } catch (err) {
    return {
      destination: NO_DESTINATION,
      failure: err instanceof Error ? err.message : "Falha ao ler o board.",
    };
  }
}

/**
 * Importa os itens do board de Portfólio como Projects do DeskClock.
 *
 * Cada item classificado pela coluna "Oferta" vira um projeto, e a coluna "ID
 * Quadro Projeto" diz em qual board as horas daquele projeto serão gravadas. É
 * o Monday quem passa a descrever o que antes vinham de cinco escolhas na
 * configuração (workspace, duas pastas, board interno e um mapeamento à mão).
 *
 * **Board ilegível não custa o projeto.** Antes, o board fora do template era
 * recusado inteiro: o cliente não virava Project e não havia caminho nenhum
 * para lançar aquelas horas. Agora o projeto nasce sem destino — as horas não
 * sobem, o resto do app funciona — e o motivo volta em `skipped`.
 */
export async function importMondayProjects({
  api,
  projectRepo,
  portfolioBoardId,
  deskclockWorkspaceId,
  existingMappings = [],
  onProgress,
}: ImportMondayProjectsInput): Promise<ImportMondayProjectsResult> {
  const items = await api.listItems([portfolioBoardId], {
    columnIds: [PORTFOLIO_OFFER_COLUMN_ID, PORTFOLIO_BOARD_COLUMN_ID],
  });
  const existingByItem = new Map(existingMappings.map((m) => [m.portfolioItemId, m]));

  const mappings: MondayProjectMapping[] = [];
  const skipped: { boardName: string; reason: string }[] = [];

  for (const [index, item] of items.entries()) {
    onProgress?.(index, items.length);

    const scope = resolveScope(columnText(item, PORTFOLIO_OFFER_COLUMN_ID));
    if (!scope) continue;

    const project =
      (await projectRepo.findByName(item.name, deskclockWorkspaceId)) ??
      (await createProject(projectRepo, item.name, deskclockWorkspaceId).catch(() =>
        projectRepo.findByName(item.name, deskclockWorkspaceId)
      ));
    if (!project) {
      skipped.push({ boardName: item.name, reason: "Não foi possível criar o projeto." });
      continue;
    }

    const mondayBoardId = resolveProjectBoardId(item, existingByItem.get(item.id));
    const { destination, failure } = await resolveProjectDestination(api, mondayBoardId);
    if (failure) skipped.push({ boardName: item.name, reason: failure });

    mappings.push({
      deskclockProjectId: project.id,
      portfolioItemId: item.id,
      mondayBoardId,
      mondayBoardName: item.name,
      scope,
      ...destination,
    });
  }

  onProgress?.(items.length, items.length);
  return { mappings, skipped };
}

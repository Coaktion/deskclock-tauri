import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";
import type { MondayProjectMapping, MondayProjectScope } from "@shared/types/mondayConfig";
import type { MondayBoardSchema, MondayItem } from "@shared/types/monday";
import { createProject } from "@domain/usecases/projects/CreateProject";
import {
  findTimelineColumnId,
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
  /**
   * Itens do Portfólio com a coluna "Oferta" vazia, que não viram projeto.
   *
   * Volta como número porque é o que explica a diferença entre o tamanho do
   * board e o total importado — sem ele, "61 projetos" depois de um board de 63
   * linhas some com dois itens sem dizer para onde foram.
   */
  ignored: number;
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
  | "timelineColumnId"
>;

/**
 * Colunas de um projeto cujo board não foi lido — nada será escrito nele.
 *
 * `timelineColumnId` fica **de fora**, e não como `""`: o schema não foi lido,
 * então não sabemos se o board tem cronograma. `undefined` é o estado que manda
 * o import perguntar ao Monday; `""` afirmaria que a resposta é "não tem" e
 * mataria a busca de itens daquele board para sempre.
 */
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
    // Cache do id da coluna de cronograma. Com o schema em mãos ele sai de
    // graça, e é o que dispensa o ciclo de importação de reler estes mesmos
    // schemas a cada execução (§ `resolveTimelineByBoard`).
    timelineColumnId: findTimelineColumnId(schema) ?? "",
  };
}

/** O destino do envio, ou o motivo de o board não servir de destino. */
export interface ResolvedDestination {
  destination: MondayProjectDestination;
  failure?: string;
}

/**
 * Traduz um schema **já lido** no que o envio precisa saber do board.
 *
 * Os rótulos das duas colunas de status entram no mapeamento porque são eles
 * que viram Categoria e opção de Project Stage; sem o cache, cada tela teria de
 * reconsultar o schema só para exibi-los, e o envio não teria como validar o
 * rótulo antes de mandar.
 *
 * É pura porque quem lê o schema é a batelada de fora: um `getBoardSchema` por
 * projeto custava uma ida ao Monday por board mapeado, em série.
 */
export function destinationFromSchema(schema: MondayBoardSchema): ResolvedDestination {
  const resolved = resolveBoardActivitiesColumns(schema);
  if (!resolved.ok) {
    return {
      // O board não serve de destino de horas, mas o schema foi lido — então o
      // cronograma é conhecido, e o import de itens de trabalho continua
      // valendo para ele. Deixar `undefined` aqui faria esse board reler o
      // schema em todo ciclo de importação, que é o custo que este cache
      // existe para remover.
      destination: { ...NO_DESTINATION, timelineColumnId: findTimelineColumnId(schema) ?? "" },
      failure: `Não encontrado: ${resolved.missing.join(", ")}.`,
    };
  }
  return { destination: buildDestination(schema, resolved) };
}

/**
 * Lê **um** board e resolve o destino. É o caminho do campo "ID Quadro
 * Projeto" digitado à mão, onde há um board só e a leitura é o próprio
 * feedback do que a pessoa acabou de digitar.
 *
 * Nunca lança: board ilegível devolve destino vazio mais o motivo. A varredura
 * do Portfólio **não** passa por aqui — ela lê os schemas em lote.
 */
export async function resolveProjectDestination(
  api: IMondayApi,
  boardId: string
): Promise<ResolvedDestination> {
  if (!boardId) return { destination: NO_DESTINATION };
  try {
    return destinationFromSchema(await api.getBoardSchema(boardId));
  } catch (err) {
    return {
      destination: NO_DESTINATION,
      failure: err instanceof Error ? err.message : "Falha ao ler o board.",
    };
  }
}

/**
 * Schemas de todos os boards de destino, por id, numa leitura só.
 *
 * O `MondayClient` já quebra em lotes de 20 — o que existia era um
 * `getBoardSchema` **por projeto**, dentro do laço, o que fazia a varredura
 * custar uma requisição sequencial por board mapeado (~46 hoje) em vez de três.
 *
 * Board inacessível não vem no retorno, e é a **ausência** que vira o motivo no
 * `skipped`: a consulta em lote não falha por causa de um id ruim. O que falha
 * — token, rede, orçamento de complexidade — sobe como exceção e aborta a
 * varredura, de propósito. Antes, com a leitura por board dentro de um `catch`,
 * um token vencido produzia 46 destinos vazios que eram **gravados por cima**
 * do mapeamento bom, e o envio de horas parava até a próxima varredura
 * bem-sucedida.
 */
async function readBoardSchemas(
  api: IMondayApi,
  boardIds: string[]
): Promise<Map<string, MondayBoardSchema>> {
  const ids = [...new Set(boardIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  return new Map((await api.listBoardSchemas(ids)).map((schema) => [schema.id, schema]));
}

/** O destino de um board a partir dos schemas já lidos em lote. */
function destinationOf(
  schemaById: Map<string, MondayBoardSchema>,
  boardId: string
): ResolvedDestination {
  if (!boardId) return { destination: NO_DESTINATION };
  const schema = schemaById.get(boardId);
  if (!schema) {
    return {
      destination: NO_DESTINATION,
      failure: "Board não encontrado no Monday ou sem acesso.",
    };
  }
  return destinationFromSchema(schema);
}

/**
 * O Project de um item do Portfólio, criando-o na primeira vez que ele aparece.
 *
 * **O nome é comparado aparado, porque é aparado que ele é gravado**
 * (`createProject`). Comparando cru, um item com espaço na ponta não encontrava
 * o projeto que ele mesmo criara no ciclo anterior: o `createProject` recusava
 * por duplicidade, a releitura crua tornava a não encontrar, e aquele board
 * voltava em `skipped` a cada varredura — sem mapeamento, e portanto sem envio
 * de horas.
 *
 * O recém-criado entra no índice para o item de nome repetido no Portfólio
 * reaproveitá-lo, como a consulta ao banco fazia.
 */
async function ensureProject(
  projectRepo: IProjectRepository,
  byName: Map<string, Project>,
  rawName: string,
  workspaceId: string
): Promise<Project | null> {
  const name = rawName.trim();
  const existing = byName.get(name);
  if (existing) return existing;

  // A releitura no `catch` cobre a criação que corre em paralelo com esta: o
  // erro esperado é o de nome duplicado, e nele o projeto existe.
  const created = await createProject(projectRepo, name, workspaceId).catch(() =>
    projectRepo.findByName(name, workspaceId)
  );
  if (created) byName.set(name, created);
  return created;
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

  // A classificação vem **antes** do laço para o progresso poder começar no
  // total que de fato será importado. Contando as 63 linhas do board para
  // terminar em 61, os dois itens sem "Oferta" sumiam sem deixar rastro: o
  // usuário via o número encolher e não tinha como saber o que ficou de fora.
  const classified = items.flatMap((item) => {
    const scope = resolveScope(columnText(item, PORTFOLIO_OFFER_COLUMN_ID));
    return scope ? [{ item, scope }] : [];
  });

  // O board de destino é resolvido **antes** do laço para que os schemas possam
  // ser lidos numa batelada só. A regra de merge é a mesma de sempre: o remoto
  // ganha quando vem preenchido, vazio nunca apaga o local.
  const targets = classified.map(({ item, scope }) => ({
    item,
    scope,
    mondayBoardId: resolveProjectBoardId(item, existingByItem.get(item.id)),
  }));
  const schemaById = await readBoardSchemas(
    api,
    targets.map((t) => t.mondayBoardId)
  );

  // Um `findByName` por item eram ~60 idas ao SQLite, em série, para montar um
  // índice que uma leitura só resolve. `findAll` já é escopado pelo workspace,
  // que é exatamente o recorte da unicidade do nome (§4.3), e a comparação da
  // coluna é byte-exata — o `Map` responde o mesmo que a consulta respondia.
  const projectsByName = new Map(
    (await projectRepo.findAll(deskclockWorkspaceId)).map((p) => [p.name, p])
  );

  const mappings: MondayProjectMapping[] = [];
  const skipped: { boardName: string; reason: string }[] = [];

  for (const [index, { item, scope, mondayBoardId }] of targets.entries()) {
    onProgress?.(index, targets.length);

    const project = await ensureProject(
      projectRepo,
      projectsByName,
      item.name,
      deskclockWorkspaceId
    );
    if (!project) {
      skipped.push({ boardName: item.name, reason: "Não foi possível criar o projeto." });
      continue;
    }

    const { destination, failure } = destinationOf(schemaById, mondayBoardId);
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

  onProgress?.(classified.length, classified.length);
  return { mappings, skipped, ignored: items.length - classified.length };
}

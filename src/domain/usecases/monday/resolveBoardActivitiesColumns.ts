import type { MondayBoardSchema, MondayColumn, MondayGroup } from "@shared/types/monday";
import type { MondayActivityColumnIds } from "@shared/types/mondayConfig";

/** Nome da view/grupo que concentra os apontamentos de horas. */
const ACTIVITIES_NAMES = ["activities", "atividades"];

const TITLES = {
  reportedHours: ["reported hours", "horas reportadas"],
  billingType: ["billing type", "tipo de cobranca"],
  activityType: ["activity type", "tipo de atividade"],
  projectStage: ["project stage", "etapa do projeto"],
  nonBillableReason: ["non billable reason", "motivo de nao faturavel", "motivo non billable"],
  startDate: ["start date", "data de inicio"],
  endDate: ["end date", "data de termino", "data de fim"],
  status: ["status"],
  /** Cronograma **planejado** do item de trabalho, base do import (§ Fase 5). */
  timeline: ["timeline", "cronograma", "linha do tempo"],
} as const;

/** Report Type assumido pela atividade que não escolheu nenhum. */
export const DEFAULT_REPORT_TYPE = "Activity";

/**
 * Para onde cada Report Type manda a atividade.
 *
 * No board de Report o Report Type é coluna, e é ela que a automação lê para
 * rotear o apontamento. Escrevendo **direto** no board do projeto não há
 * automação nenhuma: o roteamento vira nossa responsabilidade, e o Report Type
 * deixa de ser coluna para virar o **grupo** em que o item nasce.
 *
 * A resolução é pelo **título do grupo**, nunca pelo id: `group_mm19wbff` é
 * "Timeline" num board de cliente e "Activities" no interno — casar por id
 * gravaria as horas no cronograma do cliente.
 *
 * Board interno tem um grupo só, então lá só `Activity` resolve; os outros
 * quatro recusam o envio com mensagem em vez de cair no Activities calados, que
 * reportaria como atividade o que o usuário classificou como reunião ou risco.
 */
export const REPORT_TYPE_GROUP_TITLES: Record<string, readonly string[]> = {
  [DEFAULT_REPORT_TYPE]: ACTIVITIES_NAMES,
  Meeting: ["meetings", "reunioes"],
  Expense: ["expenses", "despesas"],
  Risk: ["risks", "riscos"],
  "Lesson Learned": ["lessons learned", "licoes aprendidas"],
};

/**
 * Ids das colunas de data no template atual, usados quando o título não bate.
 *
 * Contraria o "nunca hardcodar id" do resto do arquivo, e é deliberado: o
 * usuário pediu o preenchimento agora e todos os boards nascem do mesmo
 * template. O id só é aceito se **existir no schema do board** — inventar uma
 * coluna faria o Monday recusar a escrita inteira, do jeito que já aconteceu
 * com rótulo inexistente.
 */
const TEMPLATE_DATE_COLUMN_IDS = {
  startDate: "date_mm33tthy",
  endDate: "date_mm33zcmr",
} as const;

export type ResolveActivitiesResult =
  | {
      ok: true;
      activitiesGroupId: string;
      reportTypeGroupIds: Record<string, string>;
      columnIds: MondayActivityColumnIds;
    }
  | { ok: false; missing: string[] };

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findColumn(
  columns: MondayColumn[],
  candidates: readonly string[]
): MondayColumn | undefined {
  return columns.find((c) => candidates.includes(normalize(c.title)));
}

/** Coluna de data pelo título; na falta dele, pelo id conhecido do template. */
function findDateColumn(
  columns: MondayColumn[],
  titles: readonly string[],
  slot: keyof typeof TEMPLATE_DATE_COLUMN_IDS
): MondayColumn | undefined {
  const id = TEMPLATE_DATE_COLUMN_IDS[slot];
  return findColumn(columns, titles) ?? columns.find((c) => c.id === id);
}

/**
 * Extrai o id do grupo referenciado nas regras de uma view do Monday
 * (`settings_str` traz os grupos filtrados). Usado como fallback quando nenhum
 * grupo do board se chama "Activities".
 */
/**
 * Grupo de destino de cada Report Type que o board tem.
 *
 * `Activity` sai do grupo já resolvido — inclusive quando ele veio da view, e
 * não de um grupo homônimo. Os demais só entram se houver grupo com o título
 * correspondente: a ausência aqui é o que faz o envio recusar aquele Report
 * Type em vez de escrever no grupo errado.
 */
function resolveReportTypeGroups(
  groups: MondayGroup[],
  activitiesGroupId: string
): Record<string, string> {
  const ids: Record<string, string> = { [DEFAULT_REPORT_TYPE]: activitiesGroupId };
  for (const [label, titles] of Object.entries(REPORT_TYPE_GROUP_TITLES)) {
    if (label === DEFAULT_REPORT_TYPE) continue;
    const group = groups.find((g) => titles.includes(normalize(g.title)));
    if (group) ids[label] = group.id;
  }
  return ids;
}

function groupIdFromViewSettings(
  settingsStr: string | undefined,
  groupIds: string[]
): string | undefined {
  if (!settingsStr) return undefined;
  return groupIds.find((id) => settingsStr.includes(id));
}

/**
 * Resolve, a partir do schema de um board, onde as horas serão gravadas.
 *
 * Ids de grupo e de coluna são gerados por template (`mmXXXX`) e variam de board
 * para board — por isso resolvemos pelo **título** da coluna e pelo **nome** do
 * grupo/view, e cacheamos o resultado no mapeamento do projeto.
 *
 * **Só quatro coisas recusam o board:** o grupo Activities (sem ele não há onde
 * criar a atividade), Reported Hours (sem ela o envio de horas não registra hora
 * nenhuma, que é o ponto), Activity Type e a coluna de pessoa. Billing type,
 * Status, Project Stage e as duas datas são opcionais: board que não as tem vira
 * projeto do mesmo jeito e recebe um payload sem elas. Exigir o template inteiro
 * deixava clientes de fora sem alternativa nenhuma — não dava para enviar as
 * horas daquele board por caminho algum.
 */
export function resolveBoardActivitiesColumns(schema: MondayBoardSchema): ResolveActivitiesResult {
  const missing: string[] = [];

  const groupIds = schema.groups.map((g) => g.id);
  const activitiesGroup = schema.groups.find((g) => ACTIVITIES_NAMES.includes(normalize(g.title)));
  const activitiesView = schema.views.find((v) => ACTIVITIES_NAMES.includes(normalize(v.name)));
  const activitiesGroupId =
    activitiesGroup?.id ?? groupIdFromViewSettings(activitiesView?.settingsStr, groupIds);
  if (!activitiesGroupId) missing.push("grupo Activities");

  const reportedHours = findColumn(schema.columns, TITLES.reportedHours);
  if (!reportedHours) missing.push("coluna Reported Hours");

  const activityType = findColumn(schema.columns, TITLES.activityType);
  if (!activityType) missing.push("coluna Activity Type");

  // A coluna de pessoa não entra só no payload: é por ela que o gerenciador de
  // atividades e o import de itens pedem ao Monday **apenas os itens do usuário**
  // (`listItemsOwnedBy`). Os boards são do time inteiro, então sem ela as duas
  // telas trariam o trabalho de todo mundo — com um botão de excluir ao lado.
  const person = schema.columns.find((c) => c.type === "people");
  if (!person) missing.push("coluna de pessoa");

  if (!activitiesGroupId || !reportedHours || !activityType || !person) {
    return { ok: false, missing };
  }

  // Daqui para baixo, coluna ausente não recusa o board — só não é escrita.
  const billingType = findColumn(schema.columns, TITLES.billingType);
  const status = findColumn(schema.columns, TITLES.status);
  const projectStage = findColumn(schema.columns, TITLES.projectStage);
  const nonBillableReason = findColumn(schema.columns, TITLES.nonBillableReason);
  const startDate = findDateColumn(schema.columns, TITLES.startDate, "startDate");
  const endDate = findDateColumn(schema.columns, TITLES.endDate, "endDate");

  return {
    ok: true,
    activitiesGroupId,
    reportTypeGroupIds: resolveReportTypeGroups(schema.groups, activitiesGroupId),
    columnIds: {
      reportedHours: reportedHours.id,
      activityType: activityType.id,
      ...(billingType ? { billingType: billingType.id } : {}),
      ...(status ? { status: status.id } : {}),
      ...(projectStage ? { projectStage: projectStage.id } : {}),
      ...(nonBillableReason ? { nonBillableReason: nonBillableReason.id } : {}),
      ...(startDate ? { startDate: startDate.id } : {}),
      ...(endDate ? { endDate: endDate.id } : {}),
      person: person.id,
    },
  };
}

/**
 * Id da coluna de cronograma planejado, para o import de itens de trabalho.
 *
 * Resolvida pelo **título exato**, e não pelo primeiro `type: "timeline"` do
 * board: o template traz até quatro colunas desse tipo ("Actual Timeline" e as
 * duas "Baseline of…" convivem com "Timeline"), e pegar a primeira preenchida
 * importaria o cronograma realizado no lugar do planejado — sem erro nenhum
 * para avisar. Sem coluna com esse título, o item entra sem data.
 */
export function findTimelineColumnId(schema: MondayBoardSchema): string | undefined {
  return findColumn(schema.columns, TITLES.timeline)?.id;
}

/**
 * Rótulos disponíveis numa coluna `status`/`color`.
 *
 * Aparados na origem: do lado DeskClock todo mundo apara (`createCategory`,
 * `buildOptions`), então um rótulo com espaço nas pontas viraria categoria
 * `"Development"` e ficaria `" Development "` no cache do mapeamento — e o
 * casamento por nome do envio falharia em silêncio.
 *
 * **Sem repetição**, e é o aparar que a torna possível: a coluna guarda um
 * rótulo por índice, então `{"0":"Development","1":" Development "}` chegava
 * aqui como duas entradas idênticas. O que se faz com a lista não distingue as
 * duas — o envio casa por nome e a tela oferece uma opção —, mas a segunda
 * aparecia como opção repetida no gerenciador de atividades e derrubava a
 * unicidade da `key` do React. A ordem é a de primeira aparição, como em
 * `mergeLabels`.
 */
export function parseStatusLabels(column: MondayColumn | undefined): string[] {
  if (!column?.settingsStr) return [];
  try {
    const parsed = JSON.parse(column.settingsStr) as { labels?: Record<string, string> };
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const raw of Object.values(parsed.labels ?? {})) {
      const label = raw.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    return labels;
  } catch {
    return [];
  }
}

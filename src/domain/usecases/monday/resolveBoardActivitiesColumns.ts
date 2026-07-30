import type { MondayBoardSchema, MondayColumn } from "@shared/types/monday";
import type { MondayActivityColumnIds } from "@shared/types/mondayConfig";

/** Nome da view/grupo que concentra os apontamentos de horas. */
const ACTIVITIES_NAMES = ["activities", "atividades"];

const TITLES = {
  reportedHours: ["reported hours", "horas reportadas"],
  billingType: ["billing type", "tipo de cobranca"],
  activityType: ["activity type", "tipo de atividade"],
  projectStage: ["project stage", "etapa do projeto"],
  status: ["status"],
} as const;

export type ResolveActivitiesResult =
  | { ok: true; activitiesGroupId: string; columnIds: MondayActivityColumnIds }
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

/**
 * Extrai o id do grupo referenciado nas regras de uma view do Monday
 * (`settings_str` traz os grupos filtrados). Usado como fallback quando nenhum
 * grupo do board se chama "Activities".
 */
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

  const billingType = findColumn(schema.columns, TITLES.billingType);
  if (!billingType) missing.push("coluna Billing type");

  const activityType = findColumn(schema.columns, TITLES.activityType);
  if (!activityType) missing.push("coluna Activity Type");

  const status = findColumn(schema.columns, TITLES.status);
  if (!status) missing.push("coluna Status");

  const person = schema.columns.find((c) => c.type === "people");
  if (!person) missing.push("coluna de pessoa");

  if (!activitiesGroupId || !reportedHours || !billingType || !activityType || !status || !person) {
    return { ok: false, missing };
  }

  const projectStage = findColumn(schema.columns, TITLES.projectStage);

  return {
    ok: true,
    activitiesGroupId,
    columnIds: {
      reportedHours: reportedHours.id,
      billingType: billingType.id,
      activityType: activityType.id,
      ...(projectStage ? { projectStage: projectStage.id } : {}),
      status: status.id,
      person: person.id,
    },
  };
}

/** Rótulos disponíveis numa coluna `status`/`color`, para popular dropdowns. */
export function parseStatusLabels(column: MondayColumn | undefined): string[] {
  if (!column?.settingsStr) return [];
  try {
    const parsed = JSON.parse(column.settingsStr) as { labels?: Record<string, string> };
    return Object.values(parsed.labels ?? {}).filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

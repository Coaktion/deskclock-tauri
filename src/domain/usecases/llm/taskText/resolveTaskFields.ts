import type { Category } from "@domain/entities/Category";
import { resolveCategoriesForProject } from "@domain/usecases/projectCategories/resolveCategoriesForProject";
import type { UUID } from "@shared/types";
import { Findings, valueFor } from "./findings";
import { matchCatalogItem } from "./matchCatalogItem";
import { parseBillable } from "./parseYesNo";
import { resolveCustomValues } from "./resolveCustomValues";
import {
  TASK_FIELD_KEYS,
  type TaskFieldHint,
  type TaskTextCatalog,
  type TaskTextFields,
  type TaskTextInterpretation,
  type TaskTextSource,
} from "./types";

const NO_ASSOCIATION: ReadonlySet<UUID> = new Set<UUID>();

function hintByKey(hints: TaskFieldHint[], key: string): TaskFieldHint | undefined {
  return hints.find((h) => h.key === key);
}

function resolveNamed(
  hint: TaskFieldHint | undefined,
  query: string | undefined,
  items: { id: UUID; name: string }[],
  findings: Findings
): UUID | null {
  if (!hint || !query) return null;
  const candidates = items.map((item) => ({ id: item.id, label: item.name }));
  return findings.record(hint, query, matchCatalogItem(query, candidates));
}

/**
 * Categoria no recorte do projeto, quando ele foi resolvido. Projeto ambíguo
 * ou ausente não recorta nada: ainda não se sabe qual é, e recortar pelo
 * errado esconderia a categoria certa.
 */
function categoriesInScope(projectId: UUID | null, catalog: TaskTextCatalog): Category[] {
  if (!projectId) return catalog.categories;
  const allowed = catalog.projectCategoryMap.get(projectId) ?? NO_ASSOCIATION;
  return resolveCategoriesForProject(catalog.categories, allowed);
}

/**
 * Casa os valores crus do texto com o catálogo do workspace, **localmente** —
 * é aqui, e não no provedor, que nome de cliente vira id.
 *
 * Billable explícito no texto vence; ausente (ou ilegível), vale o
 * `defaultBillable` da categoria resolvida, e sem categoria, `true` (§6.2).
 */
export function resolveTaskFields(
  parsed: TaskTextFields,
  hints: TaskFieldHint[],
  catalog: TaskTextCatalog,
  source: TaskTextSource
): TaskTextInterpretation {
  const findings = new Findings();
  const projectHint = hintByKey(hints, TASK_FIELD_KEYS.project);
  const categoryHint = hintByKey(hints, TASK_FIELD_KEYS.category);
  const billableHint = hintByKey(hints, TASK_FIELD_KEYS.billable);

  const projectId = resolveNamed(
    projectHint,
    valueFor(parsed, projectHint),
    catalog.projects,
    findings
  );
  const categories = categoriesInScope(projectId, catalog);
  const categoryId = resolveNamed(
    categoryHint,
    valueFor(parsed, categoryHint),
    categories,
    findings
  );

  const billableQuery = valueFor(parsed, billableHint);
  const explicit = billableQuery === undefined ? null : parseBillable(billableQuery);
  if (billableHint && billableQuery !== undefined && explicit === null) {
    findings.missing(billableHint, billableQuery);
  }
  const category = categories.find((c) => c.id === categoryId);

  return {
    name: parsed.name.trim() || null,
    projectId,
    categoryId,
    billable: explicit ?? category?.defaultBillable ?? true,
    billableExplicit: explicit !== null,
    customValues: resolveCustomValues(parsed, hints, catalog, findings),
    ambiguities: findings.ambiguities,
    notFound: findings.notFound,
    source,
  };
}

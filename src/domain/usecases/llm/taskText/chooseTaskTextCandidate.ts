import type { UUID } from "@shared/types";
import { categoriesInScope } from "./resolveTaskFields";
import {
  TASK_FIELD_KEYS,
  type TaskTextAmbiguity,
  type TaskTextCatalog,
  type TaskTextInterpretation,
} from "./types";

function applyCategory(
  interpretation: TaskTextInterpretation,
  categoryId: UUID,
  catalog: TaskTextCatalog
): TaskTextInterpretation {
  const category = catalog.categories.find((c) => c.id === categoryId);
  return {
    ...interpretation,
    categoryId,
    billable: interpretation.billableExplicit
      ? interpretation.billable
      : (category?.defaultBillable ?? true),
  };
}

/** A ambiguidade de categoria refeita no recorte do projeto escolhido. */
function narrowCategoryAmbiguity(
  interpretation: TaskTextInterpretation,
  allowed: Set<UUID>,
  catalog: TaskTextCatalog
): TaskTextInterpretation {
  const ambiguity = interpretation.ambiguities.find((a) => a.key === TASK_FIELD_KEYS.category);
  if (!ambiguity) return interpretation;
  const candidates = ambiguity.candidates.filter((c) => allowed.has(c.id));
  const others = interpretation.ambiguities.filter((a) => a !== ambiguity);
  if (candidates.length === 1) {
    return applyCategory({ ...interpretation, ambiguities: others }, candidates[0].id, catalog);
  }
  if (candidates.length === 0) {
    const { key, sigla, label, query } = ambiguity;
    return {
      ...interpretation,
      ambiguities: others,
      notFound: [...interpretation.notFound, { key, sigla, label, query }],
    };
  }
  const narrowed: TaskTextAmbiguity = { ...ambiguity, candidates };
  return {
    ...interpretation,
    ambiguities: interpretation.ambiguities.map((a) => (a === ambiguity ? narrowed : a)),
  };
}

/**
 * Trocar o projeto zera a categoria que ele não oferece (§6.4) — e, com ela, o
 * billable que tinha vindo dela, quando o texto não disse b/nb.
 */
function applyProject(
  interpretation: TaskTextInterpretation,
  projectId: UUID,
  catalog: TaskTextCatalog
): TaskTextInterpretation {
  const allowed = new Set(categoriesInScope(projectId, catalog).map((c) => c.id));
  const keepsCategory =
    interpretation.categoryId !== null && allowed.has(interpretation.categoryId);
  const next: TaskTextInterpretation = keepsCategory
    ? { ...interpretation, projectId }
    : {
        ...interpretation,
        projectId,
        categoryId: null,
        billable: interpretation.billableExplicit ? interpretation.billable : true,
      };
  return narrowCategoryAmbiguity(next, allowed, catalog);
}

/**
 * Resolve na prévia o campo que o texto deixou ambíguo, com o candidato que o
 * usuário escolheu.
 *
 * Candidato que não está na lista da ambiguidade é ignorado: a prévia só
 * oferece os dela, e aceitar outro seria gravar um id que ninguém viu.
 */
export function chooseTaskTextCandidate(
  interpretation: TaskTextInterpretation,
  key: string,
  candidateId: UUID,
  catalog: TaskTextCatalog
): TaskTextInterpretation {
  const ambiguity = interpretation.ambiguities.find((a) => a.key === key);
  if (!ambiguity?.candidates.some((c) => c.id === candidateId)) return interpretation;
  const next = {
    ...interpretation,
    ambiguities: interpretation.ambiguities.filter((a) => a !== ambiguity),
  };

  if (key === TASK_FIELD_KEYS.project) return applyProject(next, candidateId, catalog);
  if (key === TASK_FIELD_KEYS.category) return applyCategory(next, candidateId, catalog);
  // Campo personalizado `select`: a chave é o id do campo, e o valor gravado é o id da opção.
  return { ...next, customValues: { ...next.customValues, [key]: candidateId } };
}

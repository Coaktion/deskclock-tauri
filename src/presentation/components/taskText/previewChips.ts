import { formatCustomValue } from "@domain/usecases/customFields/customValueCodec";
import {
  TASK_FIELD_KEYS,
  type TaskFieldHint,
  type TaskTextCandidate,
  type TaskTextCatalog,
  type TaskTextInterpretation,
} from "@domain/usecases/llm/taskText/types";

/** Um chip da prévia: o que ele diz e se pede ação. */
export type PreviewChip =
  | { kind: "value"; key: string; label: string; title: string }
  | { kind: "empty"; key: string; label: string }
  | { kind: "billable"; key: string; billable: boolean }
  | { kind: "notFound"; key: string; label: string; query: string; title: string }
  | {
      kind: "ambiguous";
      key: string;
      label: string;
      fieldLabel: string;
      title: string;
      candidates: TaskTextCandidate[];
    };

const NAME_KEY = "name";

function nameChip(name: string | null): PreviewChip {
  return name
    ? { kind: "value", key: NAME_KEY, label: name, title: "Nome" }
    : { kind: "empty", key: NAME_KEY, label: "Sem nome" };
}

/** O chip do campo quando o texto o resolveu, ou quando não disse nada dele. */
function resolvedChip(
  hint: TaskFieldHint,
  interpretation: TaskTextInterpretation,
  catalog: TaskTextCatalog
): PreviewChip | null {
  const { key, label } = hint;
  if (hint.kind === "billable") {
    return { kind: "billable", key, billable: interpretation.billable };
  }
  if (hint.kind === "project" || hint.kind === "category") {
    const id = hint.kind === "project" ? interpretation.projectId : interpretation.categoryId;
    const items = hint.kind === "project" ? catalog.projects : catalog.categories;
    const name = items.find((item) => item.id === id)?.name;
    return name ? { kind: "value", key, label: name, title: label } : { kind: "empty", key, label };
  }
  const field = catalog.customFields.find((f) => f.id === hint.fieldId);
  const stored = interpretation.customValues[key];
  if (!field || !stored) return null;
  const value = formatCustomValue(field, stored);
  return { kind: "value", key, label: `${label}: ${value}`, title: label };
}

/**
 * Os chips da prévia, na ordem da instrução: o nome e um por campo. Projeto,
 * categoria e billable aparecem sempre — vazios, dizem que o texto não os
 * trouxe; campo personalizado só aparece com valor, ou com problema.
 *
 * O billable não some quando o valor dele não deu para ler: o chip mostra o que
 * vai valer, e o "não encontrado" vem ao lado.
 */
export function buildPreviewChips(
  interpretation: TaskTextInterpretation,
  hints: TaskFieldHint[],
  catalog: TaskTextCatalog
): PreviewChip[] {
  const chips: PreviewChip[] = [nameChip(interpretation.name)];
  for (const hint of hints) {
    const ambiguity = interpretation.ambiguities.find((a) => a.key === hint.key);
    const missing = interpretation.notFound.find((n) => n.key === hint.key);
    if (ambiguity) {
      chips.push({
        kind: "ambiguous",
        key: hint.key,
        label: ambiguity.query,
        fieldLabel: hint.label,
        title: `Mais de um ${hint.label} para "${ambiguity.query}". Clique para escolher.`,
        candidates: ambiguity.candidates,
      });
      continue;
    }
    if (!missing || hint.key === TASK_FIELD_KEYS.billable) {
      const chip = resolvedChip(hint, interpretation, catalog);
      if (chip) chips.push(chip);
    }
    if (missing) {
      chips.push({
        kind: "notFound",
        key: `${hint.key}:notFound`,
        label: hint.label,
        query: missing.query,
        title: `${hint.label} "${missing.query}" não encontrado`,
      });
    }
  }
  return chips;
}

import type { UUID } from "@shared/types";
import type { CatalogMatch } from "./matchCatalogItem";
import type { TaskFieldHint, TaskTextAmbiguity, TaskTextFields, TaskTextNotFound } from "./types";

/** Acumula ambíguos e não encontrados enquanto cada campo é resolvido. */
export class Findings {
  readonly ambiguities: TaskTextAmbiguity[] = [];
  readonly notFound: TaskTextNotFound[] = [];

  record(hint: TaskFieldHint, query: string, match: CatalogMatch): UUID | null {
    if (match.kind === "resolved") return match.item.id;
    const base = { key: hint.key, sigla: hint.sigla, label: hint.label, query };
    if (match.kind === "ambiguous")
      this.ambiguities.push({ ...base, candidates: match.candidates });
    else this.notFound.push(base);
    return null;
  }

  missing(hint: TaskFieldHint, query: string): void {
    this.notFound.push({ key: hint.key, sigla: hint.sigla, label: hint.label, query });
  }
}

export function valueFor(
  parsed: TaskTextFields,
  hint: TaskFieldHint | undefined
): string | undefined {
  if (!hint) return undefined;
  const value = parsed.fields[hint.sigla]?.trim();
  return value ? value : undefined;
}

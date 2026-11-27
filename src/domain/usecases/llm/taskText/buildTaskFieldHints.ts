import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { normalizeForMatch } from "./matchCatalogItem";
import { TASK_FIELD_KEYS, type TaskFieldHint } from "./types";

const FIXED_SIGLAS = ["P", "C", "B"];
const FALLBACK_SIGLA = "F";

function letterWords(label: string): string[] {
  return normalizeForMatch(label)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/**
 * As siglas que o rótulo admite, na ordem de preferência: as iniciais, depois
 * as iniciais estendidas com as letras seguintes da última palavra, depois um
 * número. A ordem é fixa para a sigla de um campo não mudar entre aberturas da
 * tela — ela é o que o usuário decora.
 */
function siglaCandidates(label: string): string[] {
  const words = letterWords(label);
  if (words.length === 0) return [FALLBACK_SIGLA];
  const base = words.map((w) => w[0]).join("");
  const tail = words[words.length - 1].slice(1);
  return [base, ...Array.from(tail, (_, i) => base + tail.slice(0, i + 1))];
}

/** Primeira candidata livre; esgotadas, a base ganha um número (`PS2`, `PS3`…). */
function pickSigla(label: string, taken: Set<string>): string {
  const candidates = siglaCandidates(label);
  const free = candidates.find((c) => !taken.has(c));
  if (free) return free;
  let n = 2;
  while (taken.has(`${candidates[0]}${n}`)) n++;
  return `${candidates[0]}${n}`;
}

function customExample(field: CustomField): string | undefined {
  return field.type === "select" ? field.options[0]?.label : undefined;
}

/**
 * Os campos que o texto da tarefa pode preencher, na ordem em que a instrução
 * os mostra: os três fixos e cada campo personalizado ativo por `sortOrder`.
 *
 * Arquivado fica de fora porque também some dos formulários — a instrução não
 * pode pedir o que a tela de edição não deixaria escolher.
 */
export function buildTaskFieldHints(
  customFields: CustomField[],
  catalog: { projects: Project[]; categories: Category[] }
): TaskFieldHint[] {
  const fixed: TaskFieldHint[] = [
    {
      key: TASK_FIELD_KEYS.project,
      sigla: "P",
      label: "Projeto",
      kind: "project",
      example: catalog.projects[0]?.name,
    },
    {
      key: TASK_FIELD_KEYS.category,
      sigla: "C",
      label: "Categoria",
      kind: "category",
      example: catalog.categories[0]?.name,
    },
    {
      key: TASK_FIELD_KEYS.billable,
      sigla: "B",
      label: "Billable",
      kind: "billable",
      example: "nb",
    },
  ];

  const taken = new Set(FIXED_SIGLAS);
  const custom = customFields
    .filter((field) => !field.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field): TaskFieldHint => {
      const sigla = pickSigla(field.label, taken);
      taken.add(sigla);
      return {
        key: field.id,
        sigla,
        label: field.label,
        kind: field.type,
        fieldId: field.id,
        example: customExample(field),
      };
    });

  return [...fixed, ...custom].map(withoutEmptyExample);
}

/** Catálogo vazio não vira `P= ` na instrução: sem exemplo, a sigla aparece sozinha. */
function withoutEmptyExample(hint: TaskFieldHint): TaskFieldHint {
  if (hint.example?.trim()) return hint;
  return {
    key: hint.key,
    sigla: hint.sigla,
    label: hint.label,
    kind: hint.kind,
    ...(hint.fieldId ? { fieldId: hint.fieldId } : {}),
  };
}

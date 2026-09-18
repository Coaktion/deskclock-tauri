import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { deserializeCustomValue } from "@domain/usecases/customFields/customValueCodec";
import type { UUID } from "@shared/types";
import type { SharedTaskPayload } from "@shared/utils/shareLink";

/** O que o link não encontrou aqui — por nome de projeto, de categoria e por rótulo de campo. */
export interface UnresolvedShare {
  projects: string[];
  categories: string[];
  customFields: string[];
}

export interface ResolvedSharedTask {
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  /** `""` quando o link não trouxe hora. */
  startTime: string;
  endTime: string;
  /** Indexado pelo **id** do campo, como a tarefa grava. */
  customValues: CustomValues;
  unresolved: UnresolvedShare;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * A volta de `plannedTaskToSharePayload`: o payload do link contra os catálogos
 * **locais**. Projeto e categoria casam por nome, campo personalizado por
 * rótulo — é o que atravessa o contrato, porque id é local de cada banco.
 *
 * O que não casa **não some**: o id fica `null` e o nome que veio no link entra
 * em `unresolved`, porque é a UI que precisa dizer o que foi descartado. Perda
 * silenciosa aqui é defeito — a tarefa nasceria sem projeto sem nada na tela
 * explicando por quê.
 *
 * O valor do campo passa por `deserializeCustomValue` (o link carrega o texto
 * legível, não o gravado). Valor que não resolve — rótulo de opção que não
 * existe mais, `checkbox` com texto que não é "Sim" — também entra em
 * `unresolved.customFields`: gravar `""` calado seria a mesma perda.
 *
 * Não cria nada. Projeto, categoria e campo ausentes continuam ausentes, e o
 * cadastro é decisão de quem recebeu.
 */
export function resolveSharedPayload(
  payload: SharedTaskPayload,
  projects: Project[],
  categories: Category[],
  customFields: CustomField[]
): ResolvedSharedTask {
  const unresolved: UnresolvedShare = { projects: [], categories: [], customFields: [] };

  const projectName = payload.projectName?.trim();
  const project = projectName ? projects.find((p) => sameName(p.name, projectName)) : undefined;
  if (projectName && !project) unresolved.projects.push(projectName);

  const categoryName = payload.categoryName?.trim();
  const category = categoryName
    ? categories.find((c) => sameName(c.name, categoryName))
    : undefined;
  if (categoryName && !category) unresolved.categories.push(categoryName);

  const customValues: CustomValues = {};
  for (const [rawLabel, rawValue] of Object.entries(payload.customValues ?? {})) {
    const label = rawLabel.trim();
    if (!label) continue;
    const field = customFields.find((f) => sameName(f.label, label));
    if (!field) {
      unresolved.customFields.push(label);
      continue;
    }
    const stored = deserializeCustomValue(field, rawValue ?? "");
    if (!stored) {
      unresolved.customFields.push(label);
      continue;
    }
    customValues[field.id] = stored;
  }

  return {
    name: payload.name,
    projectId: project?.id ?? null,
    categoryId: category?.id ?? null,
    billable: payload.billable,
    startTime: payload.startTime ?? "",
    endTime: payload.endTime ?? "",
    customValues,
    unresolved,
  };
}

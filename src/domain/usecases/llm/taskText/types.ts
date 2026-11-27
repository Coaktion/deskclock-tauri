import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { UUID } from "@shared/types";

export type TaskFieldKind =
  "project" | "category" | "billable" | "text" | "multiline" | "select" | "checkbox";

/** As chaves dos três campos fixos; campo personalizado usa o próprio id como chave. */
export const TASK_FIELD_KEYS = {
  project: "project",
  category: "category",
  billable: "billable",
} as const;

/**
 * Um campo que o texto pode preencher, com a sigla que o usuário digita (`PS=`).
 *
 * O `example` é **só para exibição local**: sai do catálogo (nome de projeto,
 * rótulo de opção) e não pode ir ao provedor — projetos são nomes de clientes.
 */
export interface TaskFieldHint {
  key: string;
  sigla: string;
  label: string;
  kind: TaskFieldKind;
  /** Presente só nos campos personalizados. */
  fieldId?: UUID;
  example?: string;
}

/** O texto separado em nome e valores crus por sigla, antes de casar com o catálogo. */
export interface TaskTextFields {
  name: string;
  fields: Record<string, string>;
}

/** O que o casamento local consulta — tudo do workspace ativo. */
export interface TaskTextCatalog {
  projects: Project[];
  categories: Category[];
  /** Categorias associadas por projeto; projeto ausente no mapa oferece o catálogo inteiro. */
  projectCategoryMap: ReadonlyMap<UUID, ReadonlySet<UUID>>;
  customFields: CustomField[];
}

export interface TaskTextCandidate {
  id: UUID;
  label: string;
}

export interface TaskTextAmbiguity {
  key: string;
  sigla: string;
  label: string;
  query: string;
  candidates: TaskTextCandidate[];
}

export interface TaskTextNotFound {
  key: string;
  sigla: string;
  label: string;
  query: string;
}

export type TaskTextSource = "local" | "llm";

export interface TaskTextInterpretation {
  name: string | null;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  /** `true` quando o texto disse b/nb; `false` quando o valor veio da categoria ou do padrão. */
  billableExplicit: boolean;
  customValues: CustomValues;
  ambiguities: TaskTextAmbiguity[];
  notFound: TaskTextNotFound[];
  source: TaskTextSource;
}

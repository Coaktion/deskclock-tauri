import type { CustomField } from "@domain/entities/CustomField";
import { mergeLabels } from "@domain/usecases/monday/importMondayFieldCatalogs";
import { DomainError } from "@shared/errors";
import type { MondayFieldCatalogs, MondayProjectMapping } from "@shared/types/mondayConfig";

/**
 * Os campos personalizados que alimentam colunas da atividade no Monday, como os
 * cards "Project Stage" e "Non Billable reason" da Importação de dados os
 * mostram. O Report Type fica de fora: o card está adormecido
 * (`MondayImportSection`), e o que a tela não oferece a API também não.
 *
 * A tela e a API local escolhem, criam e atualizam o campo pelas mesmas regras
 * (`docs-internal/specs/mcp.md` §7, Fase D3b).
 */
export type MondayCatalogFieldName = "projectStage" | "nonBillableReason";

export const MONDAY_CATALOG_FIELD_KEYS = {
  projectStage: "mondayProjectStageFieldId",
  nonBillableReason: "mondayNonBillableReasonFieldId",
} as const satisfies Record<MondayCatalogFieldName, string>;

export const MONDAY_CATALOG_FIELD_TITLES: Record<MondayCatalogFieldName, string> = {
  projectStage: "Project Stage",
  nonBillableReason: "Non Billable reason",
};

/** Os rótulos que semeiam o campo e o nome com que o botão o cria. */
export interface MondayCatalogFieldSource {
  optionLabels: string[];
  defaultFieldLabel: string;
}

/**
 * Os rótulos de etapa vêm do catálogo e, como reserva, de qualquer projeto **de
 * cliente**: nos boards internos a coluna se chama "Project Phase" e traz
 * outros rótulos, que não são a etapa que o envio das horas preenche. A reserva
 * existe para a tela não ficar vazia enquanto os catálogos não forem lidos.
 */
export function mondayCatalogFieldSource(
  name: MondayCatalogFieldName,
  catalogs: MondayFieldCatalogs,
  mappings: MondayProjectMapping[]
): MondayCatalogFieldSource {
  if (name === "nonBillableReason") {
    return {
      optionLabels: catalogs.nonBillableReason,
      defaultFieldLabel: MONDAY_CATALOG_FIELD_TITLES.nonBillableReason,
    };
  }
  const stageSource = mappings.find(
    (m) => m.scope === "cliente" && m.projectStageLabels.length > 0
  );
  return {
    optionLabels: mergeLabels(catalogs.projectStage, stageSource?.projectStageLabels ?? []),
    defaultFieldLabel: stageSource?.projectStageTitle ?? MONDAY_CATALOG_FIELD_TITLES.projectStage,
  };
}

/**
 * Os campos que podem ser vinculados: só `select`. O vinculado continua na
 * lista mesmo arquivado — sumir com ele faria o vínculo existente parecer
 * inexistente.
 */
export function linkableCatalogFields(fields: CustomField[], linkedId: string): CustomField[] {
  return fields.filter((f) => f.type === "select" && (!f.archived || f.id === linkedId));
}

/** Rótulos do board que o campo vinculado ainda não tem como opção. */
export function missingCatalogOptions(field: CustomField, optionLabels: string[]): string[] {
  return optionLabels.filter((l) => !field.options.some((o) => o.label === l));
}

/**
 * As opções depois do "Atualizar": as atuais, na ordem, e os rótulos novos no
 * fim. União, e não substituição — opção removida sumiria do formulário, e o id
 * dela é o valor gravado nas tarefas.
 */
export function mergedCatalogOptionLabels(field: CustomField, optionLabels: string[]): string[] {
  const merged = field.options.map((o) => o.label);
  for (const label of optionLabels) if (!merged.includes(label)) merged.push(label);
  return merged;
}

/** O nome com que "Criar do Monday" cria o campo. */
export function catalogFieldLabel(defaultFieldLabel: string, title: string): string {
  return defaultFieldLabel.trim() || title;
}

/**
 * O campo homônimo que o "Criar do Monday" reaproveita, ou `null` para criar.
 *
 * Só um `select` serve: vincular um campo `text` homônimo mandaria texto livre
 * para uma coluna `status`. Criar estouraria `DuplicateNameError`, cuja
 * mensagem não diz o que fazer — daí o erro próprio.
 */
export function catalogFieldHomonym(fields: CustomField[], label: string): CustomField | null {
  const homonym = fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  if (homonym && homonym.type !== "select") {
    throw new DomainError(
      `Já existe um campo "${label}" que não é de seleção. Renomeie-o na tela de Dados ou escolha outro campo na lista.`
    );
  }
  return homonym ?? null;
}

/** Por que o botão do card está desabilitado: o catálogo não foi lido. */
export const MONDAY_CATALOG_EMPTY_HINT = "Leia os catálogos para carregar os rótulos desta coluna.";

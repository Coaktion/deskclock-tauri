import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { findByNameCaseInsensitive } from "@shared/utils/calendarMetadata";
import { findColumnValue, parseTimelinePeriod, type MondayItemPeriod } from "./mondayItemPeriod";

/** Um item do Monday já resolvido contra o mapeamento do board. */
export interface MondayImportRow {
  item: MondayItem;
  /** Project do DeskClock vinculado ao board de origem. */
  project: Project;
  period: MondayItemPeriod | null;
  /** Rótulo da coluna Activity Type, quando o board a preencheu. */
  activityTypeLabel: string;
  /** Rótulo da coluna Project Stage, quando o board a preencheu. */
  projectStageLabel: string;
}

/** O que o item sugere para a planejada, antes de qualquer edição do usuário. */
export interface MondayItemDefaults {
  categoryId: string | null;
  categoryName: string;
  billable: boolean;
  /** Hoje só o Project Stage, mas no formato de campos personalizados da planejada. */
  customValues: CustomValues;
}

/**
 * Cruza os itens com os boards mapeados: cada linha ganha o Project do
 * DeskClock, o período da Timeline e os rótulos que viram categoria e etapa.
 *
 * `timelineByBoard` vem de fora porque o id da coluna de cronograma varia por
 * board, não cabe no mapeamento cacheado e é resolvido pelo título no schema —
 * o board do template tem várias colunas `timeline` e a primeira é a realizada.
 *
 * Item de board sem Project correspondente é descartado: a planejada nasceria
 * apontando para um projeto que a tela nem exibe.
 */
export function buildImportRows(
  items: MondayItem[],
  mappings: MondayProjectMapping[],
  projects: Project[],
  timelineByBoard: Map<string, string | undefined>
): MondayImportRow[] {
  const projectByBoard = new Map(
    mappings.map((m) => [m.mondayBoardId, projects.find((p) => p.id === m.deskclockProjectId)])
  );
  const columnsByBoard = new Map(mappings.map((m) => [m.mondayBoardId, m.columnIds]));

  return items.flatMap<MondayImportRow>((item) => {
    const project = projectByBoard.get(item.boardId);
    if (!project) return [];
    const columnIds = columnsByBoard.get(item.boardId);
    return [
      {
        item,
        project,
        period: parseTimelinePeriod(findColumnValue(item, timelineByBoard.get(item.boardId))),
        activityTypeLabel: findColumnValue(item, columnIds?.activityType)?.text?.trim() ?? "",
        projectStageLabel: findColumnValue(item, columnIds?.projectStage)?.text?.trim() ?? "",
      },
    ];
  });
}

/**
 * Colunas que a busca de itens precisa trazer: as duas do mapeamento mais a de
 * cronograma de cada board. Pedir só estas não é economia — o board do template
 * tem mais de sessenta colunas.
 */
export function importColumnIds(
  mappings: MondayProjectMapping[],
  timelineByBoard: Map<string, string | undefined>
): string[] {
  const ids = [
    ...mappings.map((m) => m.columnIds.activityType),
    ...mappings.map((m) => m.columnIds.projectStage),
    ...timelineByBoard.values(),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/**
 * A categoria nasce do Activity Type do próprio item, e a etapa da coluna
 * Project Stage: desde a Fase 4 os três casam **pelo nome** (a opção do campo
 * personalizado foi semeada com os rótulos do board), então o item traz a
 * própria sugestão sem tabela de mapeamento. Sem correspondência, fica vazio.
 *
 * Vive aqui, e não no modal, porque o import manual e o automático precisam
 * concordar sobre o que um item vira (§9.4).
 */
export function resolveItemDefaults(
  row: Pick<MondayImportRow, "activityTypeLabel" | "projectStageLabel">,
  categories: Category[],
  stageField: CustomField | null
): MondayItemDefaults {
  const matched = findByNameCaseInsensitive(row.activityTypeLabel, categories);
  const stageOption = findStageOption(row.projectStageLabel, stageField);
  return {
    categoryId: matched?.id ?? null,
    categoryName: matched?.name ?? "",
    // §6.2: o billable acompanha a categoria escolhida.
    billable: matched?.defaultBillable ?? false,
    customValues: stageField && stageOption ? { [stageField.id]: stageOption.id } : {},
  };
}

/** Opção do campo de etapa cujo rótulo bate com o do board, ignorando caixa. */
export function findStageOption(label: string, stageField: CustomField | null) {
  const wanted = label.trim().toLowerCase();
  if (!wanted) return undefined;
  return stageField?.options.find((o) => o.label.trim().toLowerCase() === wanted);
}

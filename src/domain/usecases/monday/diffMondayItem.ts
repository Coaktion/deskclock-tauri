import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { MondayItemSnapshot } from "@domain/integrations/TrackedMondayItem";
import { findByNameCaseInsensitive } from "@shared/utils/calendarMetadata";
import { findStageOption, type MondayImportRow } from "./mondayImportRows";
import { periodToSchedule, samePeriod, type MondayItemPeriod } from "./mondayItemPeriod";

/**
 * O que mudou **no Monday** desde o último sync. Campo ausente significa "o
 * Monday não tocou nisso" — e é por isso que a edição local sobrevive: só o que
 * aparece aqui é reescrito na planejada.
 */
export interface MondayItemChanges {
  name?: string;
  period?: MondayItemPeriod | null;
  activityTypeLabel?: string;
  projectStageLabel?: string;
}

/** Retrato do item como ele está agora, para guardar no rastreamento. */
export function snapshotOf(row: MondayImportRow): MondayItemSnapshot {
  return {
    name: row.item.name,
    period: row.period,
    activityTypeLabel: row.activityTypeLabel,
    projectStageLabel: row.projectStageLabel,
  };
}

export function diffSnapshot(
  snapshot: MondayItemSnapshot,
  row: MondayImportRow
): MondayItemChanges {
  const changes: MondayItemChanges = {};
  if (row.item.name !== snapshot.name) changes.name = row.item.name;
  if (!samePeriod(snapshot.period, row.period)) changes.period = row.period;
  if (row.activityTypeLabel !== snapshot.activityTypeLabel) {
    changes.activityTypeLabel = row.activityTypeLabel;
  }
  if (row.projectStageLabel !== snapshot.projectStageLabel) {
    changes.projectStageLabel = row.projectStageLabel;
  }
  return changes;
}

export function hasChanges(changes: MondayItemChanges): boolean {
  return Object.keys(changes).length > 0;
}

export interface ApplyMondayChangesContext {
  categories: Category[];
  /** Null enquanto a integração não tiver o campo de etapa configurado. */
  stageField: CustomField | null;
  /** Dia usado quando o item ficou sem Timeline. */
  fallbackDayISO: string;
}

/**
 * Aplica na planejada só os campos que mudaram no Monday.
 *
 * O Activity Type arrasta a categoria e, com ela, o billable (§6.2) — trocar a
 * categoria e deixar o billable antigo geraria hora faturável em atividade que
 * o board diz que não é. Já um Activity Type que não casa com nenhuma categoria
 * **limpa** o campo: manter a categoria anterior seria afirmar algo que o board
 * deixou de dizer.
 */
export function applyMondayChanges(
  planned: PlannedTask,
  changes: MondayItemChanges,
  ctx: ApplyMondayChangesContext
): PlannedTask {
  let next = { ...planned };

  if (changes.name !== undefined) next.name = changes.name;

  if (changes.period !== undefined) {
    next = { ...next, ...periodToSchedule(changes.period, ctx.fallbackDayISO) };
  }

  if (changes.activityTypeLabel !== undefined) {
    const category = findByNameCaseInsensitive(changes.activityTypeLabel, ctx.categories);
    next.categoryId = category?.id ?? null;
    next.billable = category?.defaultBillable ?? false;
  }

  if (changes.projectStageLabel !== undefined && ctx.stageField) {
    const option = findStageOption(changes.projectStageLabel, ctx.stageField);
    const customValues = { ...next.customValues };
    if (option) customValues[ctx.stageField.id] = option.id;
    else delete customValues[ctx.stageField.id];
    next.customValues = customValues;
  }

  return next;
}

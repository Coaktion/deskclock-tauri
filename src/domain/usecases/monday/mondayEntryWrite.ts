import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IMondayActivityItemRepository } from "@domain/repositories/IMondayActivityItemRepository";
import { buildActivityColumnValues } from "@domain/usecases/monday/buildActivityColumnValues";
import type { MondayEntry } from "@domain/usecases/monday/mondayEntries";

// Editar e excluir em "Atividades no Monday", fora do hook para a API local
// gravar do mesmo jeito (`docs-internal/specs/mcp.md` §7, Fase D2b). O porquê de
// a exclusão pedir confirmação na tela está no `useMondayEntries`.

export interface MondayEntryPatch {
  name: string;
  hoursDecimal: number;
  billable: boolean;
  activityTypeLabel: string;
  projectStageLabel: string;
}

export const MONDAY_ENTRY_NAME_REQUIRED = "Informe o nome da atividade.";
export const MONDAY_ENTRY_HOURS_INVALID = "As horas devem ser um número maior ou igual a zero.";

/**
 * Por que a edição não pode subir, ou `null`. A tela não mostra a frase — só
 * desabilita o Salvar; a API a devolve.
 */
export function mondayEntryPatchError(
  patch: Pick<MondayEntryPatch, "name" | "hoursDecimal">
): string | null {
  if (patch.name.trim() === "") return MONDAY_ENTRY_NAME_REQUIRED;
  if (!Number.isFinite(patch.hoursDecimal) || patch.hoursDecimal < 0) {
    return MONDAY_ENTRY_HOURS_INVALID;
  }
  return null;
}

/**
 * O `column_values` da edição, com o nome. Mesmo serializador do envio (§9.4):
 * rótulo que não existe na coluna faz o Monday recusar a escrita inteira, então
 * Activity Type e Project Stage fora dos rótulos do board ficam fora do payload.
 * O Status vai com o rótulo que a atividade já tem.
 */
export function buildMondayEntryUpdate(
  entry: MondayEntry,
  patch: MondayEntryPatch,
  userId: string
): Record<string, unknown> {
  const values = buildActivityColumnValues({
    columnIds: entry.mapping.columnIds,
    hoursDecimal: patch.hoursDecimal,
    billable: patch.billable,
    userId,
    statusLabel: entry.statusLabel || undefined,
    ...(entry.mapping.activityTypeLabels.includes(patch.activityTypeLabel)
      ? { activityTypeLabel: patch.activityTypeLabel }
      : {}),
    ...(entry.mapping.projectStageLabels.includes(patch.projectStageLabel)
      ? { projectStageLabel: patch.projectStageLabel }
      : {}),
  });
  return { name: patch.name.trim(), ...values };
}

export async function updateMondayEntry(
  api: IMondayApi,
  entry: MondayEntry,
  patch: MondayEntryPatch,
  userId: string
): Promise<void> {
  await api.changeColumnValues(
    entry.boardId,
    entry.itemId,
    buildMondayEntryUpdate(entry, patch, userId)
  );
}

/**
 * Apaga o item no Monday e o rastreamento local. Sem limpar o rastreamento, o
 * próximo envio reencontra o item apagado, erra com `MondayNotFoundError` e
 * repete o erro a cada execução.
 */
export async function deleteMondayEntry(
  api: IMondayApi,
  activityItemRepo: Pick<IMondayActivityItemRepository, "deleteItem">,
  entry: Pick<MondayEntry, "boardId" | "itemId">
): Promise<void> {
  await api.deleteItem(entry.itemId);
  await activityItemRepo.deleteItem(entry.boardId, entry.itemId);
}

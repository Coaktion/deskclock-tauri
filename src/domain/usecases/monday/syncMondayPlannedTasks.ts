import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { TrackedMondayItem } from "@domain/integrations/TrackedMondayItem";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { localDateISO } from "@shared/utils/time";
import {
  applyMondayChanges,
  diffSnapshot,
  hasChanges,
  snapshotOf,
  type ApplyMondayChangesContext,
} from "./diffMondayItem";
import { importMondayItems } from "./importMondayItems";
import { listItemsOwnedBy } from "./listItemsOwnedBy";
import {
  buildImportRows,
  importColumnIds,
  resolveItemDefaults,
  type MondayImportRow,
} from "./mondayImportRows";
import { periodOverlaps } from "./mondayItemPeriod";
import { findTimelineColumnId } from "./resolveBoardActivitiesColumns";

export interface SyncMondayPlannedTasksDeps {
  api: IMondayApi;
  trackedRepo: ITrackedMondayItemRepository;
  plannedRepo: IPlannedTaskRepository;
}

export interface SyncMondayPlannedTasksParams {
  /** Boards já filtrados: workspace do Monday e Project existente no ativo. */
  mappings: MondayProjectMapping[];
  projects: Project[];
  categories: Category[];
  stageField: CustomField | null;
  /** Usuário conectado — sem ele a busca traria o board do time inteiro. */
  personId: string;
  workspaceId: UUID;
  /** Janela de **criação**, em dias locais. Atualização não é recortada. */
  window: { start: string; end: string };
  nowISO: string;
  addOpenUrlAction?: boolean;
}

export interface SyncMondayPlannedTasksResult {
  created: number;
  updated: number;
  removed: number;
}

const EMPTY: SyncMondayPlannedTasksResult = { created: 0, updated: 0, removed: 0 };

/**
 * Reconcilia as tarefas do usuário nos boards do Monday com o planejamento
 * local. É o equivalente de `syncTodayMeetings` para o Monday, sem prompt: roda
 * em silêncio e o resultado é planejada criada, atualizada ou removida.
 *
 * 1. **Cria** o item ainda não rastreado cujo cronograma cruza a janela (item
 *    sem Timeline entra sempre — ele nasce no dia corrente, e escondê-lo por
 *    falta de data seria escondê-lo para sempre).
 * 2. **Atualiza** o já rastreado, campo a campo, comparando com o snapshot do
 *    último sync: só o que mudou no Monday é reescrito, então a edição local
 *    sobrevive. Fora da janela também atualiza — a janela recorta a criação, e
 *    uma planejada existente acompanha o item aonde ele for.
 * 3. **Remove** a planejada do item que sumiu da busca (excluído, reatribuído
 *    ou movido para o grupo Activities), desde que ela nunca tenha sido
 *    concluída — o que já foi trabalhado fica.
 *
 * Planejada apagada à mão não é recriada: o rastreamento continua, com o
 * snapshot em dia, e o item deixa de gerar tarefa.
 */
export async function syncMondayPlannedTasks(
  deps: SyncMondayPlannedTasksDeps,
  params: SyncMondayPlannedTasksParams
): Promise<SyncMondayPlannedTasksResult> {
  const { api, trackedRepo } = deps;
  const { mappings, projects, personId, workspaceId, window, nowISO } = params;
  if (mappings.length === 0 || !personId) return EMPTY;

  const schemas = await api.listBoardSchemas(mappings.map((m) => m.mondayBoardId));
  const timelineByBoard = new Map(schemas.map((s) => [s.id, findTimelineColumnId(s)]));
  const items = await listItemsOwnedBy(api, mappings, personId, {
    // O grupo Activities é o destino das horas que o DeskClock envia;
    // reimportá-lo duplicaria trabalho que já está registrado aqui.
    scope: "outsideActivities",
    columnIds: importColumnIds(mappings, timelineByBoard),
  });

  const rows = buildImportRows(items, mappings, projects, timelineByBoard);
  const tracked = await trackedRepo.listForWorkspace(workspaceId);
  const trackedByItem = new Map(tracked.map((t) => [t.mondayItemId, t]));
  const ctx: ApplyMondayChangesContext = {
    categories: params.categories,
    stageField: params.stageField,
    fallbackDayISO: localDateISO(nowISO),
  };

  const pending: MondayImportRow[] = [];
  let updated = 0;
  for (const row of rows) {
    const record = trackedByItem.get(row.item.id);
    if (!record) {
      if (!row.period || periodOverlaps(row.period, window.start, window.end)) pending.push(row);
      continue;
    }
    if (await reconcile(deps, record, row, ctx, nowISO)) updated++;
  }

  const created = await createPending(deps, pending, params);
  const removed = await removeVanished(deps, tracked, rows, params);
  return { created, updated, removed };
}

/** Cria as planejadas dos itens novos e grava o vínculo de cada uma. */
async function createPending(
  { plannedRepo, trackedRepo }: SyncMondayPlannedTasksDeps,
  rows: MondayImportRow[],
  params: SyncMondayPlannedTasksParams
): Promise<number> {
  if (rows.length === 0) return 0;
  const { categories, stageField, workspaceId, nowISO, addOpenUrlAction = true } = params;

  const inputs = rows.map((row) => {
    const defaults = resolveItemDefaults(row, categories, stageField);
    return {
      item: row.item,
      projectId: row.project.id,
      categoryId: defaults.categoryId,
      billable: defaults.billable,
      period: row.period,
      customValues: defaults.customValues,
    };
  });

  // A ordem do retorno é a das entradas — é o que emparelha item e planejada.
  const planned = await importMondayItems(
    plannedRepo,
    inputs,
    nowISO,
    workspaceId,
    addOpenUrlAction
  );

  for (const [index, row] of rows.entries()) {
    await trackedRepo.upsert({
      mondayItemId: row.item.id,
      workspaceId,
      boardId: row.item.boardId,
      plannedTaskId: planned[index].id,
      snapshot: snapshotOf(row),
      importedAt: nowISO,
      updatedAt: nowISO,
    });
  }
  return planned.length;
}

/**
 * Alinha uma planejada já rastreada com o item. Devolve `true` quando a
 * planejada mudou — o snapshot é atualizado de todo jeito, inclusive quando a
 * planejada não existe mais, para o item não voltar a criar tarefa.
 */
async function reconcile(
  { plannedRepo, trackedRepo }: SyncMondayPlannedTasksDeps,
  record: TrackedMondayItem,
  row: MondayImportRow,
  ctx: ApplyMondayChangesContext,
  nowISO: string
): Promise<boolean> {
  const changes = diffSnapshot(record.snapshot, row);
  if (!hasChanges(changes)) return false;

  const planned = await plannedRepo.findById(record.plannedTaskId);
  if (planned) await plannedRepo.update(applyMondayChanges(planned, changes, ctx));

  await trackedRepo.upsert({ ...record, snapshot: snapshotOf(row), updatedAt: nowISO });
  return planned !== null;
}

/**
 * Poda o que sumiu do Monday.
 *
 * **Só entram nesta conta os boards do mapeamento atual.** Sem essa guarda,
 * desvincular um board (ou trocar o workspace do Monday) apagaria em massa
 * planejadas de itens que continuam vivos lá — a busca simplesmente deixou de
 * cobri-los.
 */
async function removeVanished(
  { plannedRepo, trackedRepo }: SyncMondayPlannedTasksDeps,
  tracked: TrackedMondayItem[],
  rows: MondayImportRow[],
  { mappings, workspaceId }: SyncMondayPlannedTasksParams
): Promise<number> {
  const searchedBoards = new Set(mappings.map((m) => m.mondayBoardId));
  const seen = new Set(rows.map((r) => r.item.id));
  let removed = 0;

  for (const record of tracked) {
    if (!searchedBoards.has(record.boardId) || seen.has(record.mondayItemId)) continue;

    const planned = await plannedRepo.findById(record.plannedTaskId);
    // Já trabalhada: a planejada fica, e o vínculo com ela também — assim o
    // ciclo seguinte não tem nada a escrever.
    if (planned && planned.completedDates.length > 0) continue;

    if (planned) {
      await plannedRepo.delete(planned.id);
      removed++;
    }
    await trackedRepo.remove(record.mondayItemId, workspaceId);
  }
  return removed;
}

import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";
import type { WeekStart } from "@shared/types/appConfig";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { addDaysISO, weekBoundsOf } from "@shared/utils/time";
import { nameKey } from "../calendar/nameKey";
import { snapshotOf } from "./diffMondayItem";
import { findImportedMondayItems } from "./findImportedMondayItems";
import { importMondayItems } from "./importMondayItems";
import { listItemsOwnedBy } from "./listItemsOwnedBy";
import { buildImportRows, importColumnIds, type MondayImportRow } from "./mondayImportRows";
import { periodOverlaps } from "./mondayItemPeriod";
import { normalizeProjectMappings } from "./normalizeProjectMappings";
import { resolveTimelineByBoard } from "./resolveTimelineColumns";

// O "Importar itens como planejadas" (`MondayImportModal`), fora da tela: a API
// local importa pelo mesmo caminho (`docs-internal/specs/mcp.md` §7, Fase D1).

export type MondayImportPeriod = "today" | "week" | "next30";

export const MONDAY_IMPORT_PERIODS: readonly MondayImportPeriod[] = ["today", "week", "next30"];

/**
 * Janela de cada filtro.
 *
 * Todas olham para a frente, e não existe "tudo": planejamento é futuro, e um
 * item encerrado em julho só polui a lista de agosto. O recorte é aplicado sobre
 * o que já veio na busca — trocar de filtro não custa chamada ao Monday.
 */
export function mondayImportWindow(
  period: MondayImportPeriod,
  todayISO: string,
  weekStartsOn: WeekStart
): { start: string; end: string } {
  switch (period) {
    case "today":
      return { start: todayISO, end: todayISO };
    case "week":
      return weekBoundsOf(todayISO, weekStartsOn);
    case "next30":
      return { start: todayISO, end: addDaysISO(todayISO, 30) };
  }
}

/**
 * Item sem cronograma no board entra em qualquer recorte: ele nasce no dia
 * corrente, e escondê-lo por falta de data seria escondê-lo para sempre.
 */
export function rowsInWindow(
  rows: MondayImportRow[],
  window: { start: string; end: string }
): MondayImportRow[] {
  return rows.filter((r) => !r.period || periodOverlaps(r.period, window.start, window.end));
}

export interface MondayImportBoards {
  /** Vínculos com quadro de destino — sem ele não há board de onde ler itens. */
  mapped: MondayProjectMapping[];
  /** Os de `mapped` cujo projeto existe no workspace da integração. */
  available: MondayProjectMapping[];
}

/**
 * Só entram os boards cujo projeto existe **no workspace da integração**. O
 * vínculo mora na config e não sabe de workspace: importar por um board
 * mapeado noutro criaria planejadas apontando para projeto de fora.
 */
export function mondayImportBoards(
  mappings: MondayProjectMapping[] | undefined,
  projects: Project[]
): MondayImportBoards {
  const mapped = normalizeProjectMappings(mappings).filter((m) => !!m.mondayBoardId);
  const available = mapped.filter((m) => projects.some((p) => p.id === m.deskclockProjectId));
  return { mapped, available };
}

export interface LoadMondayImportRowsDeps {
  api: IMondayApi;
  trackedRepo: ITrackedMondayItemRepository;
  plannedRepo: IPlannedTaskRepository;
}

export interface MondayImportCandidates {
  rows: MondayImportRow[];
  /** Itens que já viraram planejada viva — a tela os tira da lista. */
  imported: Set<string>;
  /** Nomes (minúsculos, aparados) das planejadas da janela dos itens — o chip "já existe". */
  existingNames: Set<string>;
}

/**
 * Os itens do usuário fora do grupo Activities, nos boards disponíveis, já
 * cruzados com o projeto e o cronograma — e o que deles já foi importado.
 */
export async function loadMondayImportCandidates(
  { api, trackedRepo, plannedRepo }: LoadMondayImportRowsDeps,
  params: {
    boards: MondayProjectMapping[];
    projects: Project[];
    personId: string;
    workspaceId: UUID;
    todayISO: string;
  }
): Promise<MondayImportCandidates> {
  const { boards, projects, personId, workspaceId, todayISO } = params;

  // A coluna de cronograma vem antes dos itens: é ela que diz quais colunas
  // pedir, e o template tem mais de sessenta. O id sai do cache do mapeamento —
  // só board que ainda não o tem custa uma leitura de schema.
  const timelineByBoard = await resolveTimelineByBoard(api, boards);
  const items = await listItemsOwnedBy(api, boards, personId, {
    // O grupo Activities é o destino das horas que o DeskClock envia;
    // reimportá-lo duplicaria trabalho que já está registrado aqui.
    scope: "outsideActivities",
    columnIds: importColumnIds(boards, timelineByBoard),
  });
  const rows = buildImportRows(items, boards, projects, timelineByBoard);

  // A janela de duplicatas cobre tudo o que os itens abrangem: um item de
  // agosto não teria como bater com a semana corrente.
  const days = rows.flatMap((r) => (r.period ? [r.period.startDayISO, r.period.endDayISO] : []));
  const planned = await plannedRepo.findForWeek(
    days.length > 0 ? days.reduce((a, b) => (a < b ? a : b)) : todayISO,
    days.length > 0 ? days.reduce((a, b) => (a > b ? a : b)) : todayISO,
    workspaceId
  );

  // O que já tem planejada viva sai da lista: reimportar duplicaria a tarefa e
  // ainda reapontaria o vínculo para a cópia, deixando a original órfã do sync.
  // O chip "já existe" não cobre isto — ele compara nomes, e renomear a
  // planejada o apaga.
  const imported = await findImportedMondayItems(
    { trackedRepo, plannedRepo },
    rows.map((r) => r.item.id),
    workspaceId
  );

  return {
    rows,
    imported,
    existingNames: new Set(planned.map((t) => nameKey(t.name))),
  };
}

/** Um item marcado, com o que a linha dele diz. */
export interface MondayImportSelection {
  row: MondayImportRow;
  categoryId: UUID | null;
  billable: boolean;
  customValues: CustomValues;
}

/**
 * Cria as planejadas dos itens e grava o mesmo rastreamento do import
 * automático: sem ele, a varredura seguinte não reconheceria estes itens e
 * criaria tudo de novo. Devolve as planejadas na ordem da seleção.
 */
export async function importMondaySelection(
  { plannedRepo, trackedRepo }: Omit<LoadMondayImportRowsDeps, "api">,
  selections: MondayImportSelection[],
  params: { nowISO: string; workspaceId: UUID; addOpenUrlAction: boolean }
): Promise<PlannedTask[]> {
  const { nowISO, workspaceId, addOpenUrlAction } = params;
  const planned = await importMondayItems(
    plannedRepo,
    selections.map(({ row, categoryId, billable, customValues }) => ({
      item: row.item,
      projectId: row.project.id,
      categoryId,
      billable,
      period: row.period,
      customValues,
    })),
    nowISO,
    workspaceId,
    addOpenUrlAction
  );
  for (const [index, { row }] of selections.entries()) {
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
  return planned;
}

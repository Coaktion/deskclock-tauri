import { useCallback, useEffect, useState } from "react";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { buildActivityColumnValues } from "@domain/usecases/monday/buildActivityColumnValues";
import { listItemsOwnedBy } from "@domain/usecases/monday/listItemsOwnedBy";
import {
  findColumnValue,
  parseDatePairPeriod,
  periodOverlaps,
  type MondayItemPeriod,
} from "@domain/usecases/monday/mondayItemPeriod";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { showToast } from "@shared/utils/toast";

export interface MondayEntry {
  boardId: string;
  boardName: string;
  itemId: string;
  name: string;
  url: string;
  hoursDecimal: number;
  billable: boolean;
  activityTypeLabel: string;
  projectStageLabel: string;
  statusLabel: string;
  period: MondayItemPeriod | null;
  /** Rótulos aceitos pelas colunas deste board, para os selects da edição. */
  mapping: MondayProjectMapping;
}

export interface MondayEntryPatch {
  name: string;
  hoursDecimal: number;
  billable: boolean;
  activityTypeLabel: string;
  projectStageLabel: string;
}

interface UseMondayEntriesOptions {
  mappings: MondayProjectMapping[];
  userId: string;
  range: { start: string; end: string };
  rangeValid: boolean;
}

function columnText(item: MondayItem, columnId: string | undefined): string {
  return findColumnValue(item, columnId)?.text?.trim() ?? "";
}

function columnNumber(item: MondayItem, columnId: string | undefined): number {
  const raw = columnText(item, columnId);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Colunas que a listagem e a edição leem — o resto do board não vem no payload. */
function wantedColumns(mapping: MondayProjectMapping): string[] {
  const { columnIds } = mapping;
  return [
    columnIds.reportedHours,
    columnIds.billingType,
    columnIds.activityType,
    columnIds.status,
    columnIds.person,
    ...(columnIds.projectStage ? [columnIds.projectStage] : []),
    ...(columnIds.startDate ? [columnIds.startDate] : []),
    ...(columnIds.endDate ? [columnIds.endDate] : []),
  ];
}

function toEntry(item: MondayItem, mapping: MondayProjectMapping): MondayEntry {
  const { columnIds } = mapping;
  return {
    boardId: mapping.mondayBoardId,
    boardName: mapping.mondayBoardName,
    itemId: item.id,
    name: item.name,
    url: item.url,
    hoursDecimal: columnNumber(item, columnIds.reportedHours),
    billable: columnText(item, columnIds.billingType) === "Billable",
    activityTypeLabel: columnText(item, columnIds.activityType),
    projectStageLabel: columnText(item, columnIds.projectStage),
    statusLabel: columnText(item, columnIds.status),
    period: parseDatePairPeriod(
      findColumnValue(item, columnIds.startDate),
      findColumnValue(item, columnIds.endDate)
    ),
    mapping,
  };
}

/**
 * Atividades já enviadas ao Monday, para conferir, corrigir e apagar sem sair
 * do DeskClock.
 *
 * Lista **apenas as do usuário conectado**: o board é compartilhado com o time
 * inteiro e neste app exclusão é sem confirmação (§1) — um botão de excluir ao
 * lado das horas de um colega é armadilha, não funcionalidade. O filtro vale
 * também como economia: quem trabalha em três clientes não deve pagar o
 * download das atividades de todos os boards mapeados.
 */
export function useMondayEntries({ mappings, userId, range, rangeValid }: UseMondayEntriesOptions) {
  const { createMondayApi } = useIntegrations();
  const { mondayActivityItemRepo } = useRepositories();
  const [entries, setEntries] = useState<MondayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Serializado para que a identidade do array não redispare a busca a cada
  // render da tela de integrações, que recria o mapeamento na leitura.
  const mappingsKey = mappings.map((m) => m.mondayBoardId).join(",");

  useEffect(() => {
    if (mappings.length === 0 || !userId || !rangeValid) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const api = createMondayApi();

    const byBoard = new Map(mappings.map((m) => [m.mondayBoardId, m]));

    listItemsOwnedBy(api, mappings, userId, {
      scope: "activities",
      columnIds: unique(mappings.flatMap(wantedColumns)),
    })
      .then((items) => {
        if (cancelled) return;
        setEntries(
          items.flatMap((item) => {
            const mapping = byBoard.get(item.boardId);
            if (!mapping) return [];
            const entry = toEntry(item, mapping);
            return periodOverlaps(entry.period, range.start, range.end) ? [entry] : [];
          })
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        void showToast(
          "error",
          err instanceof Error ? err.message : "Erro ao carregar atividades do Monday."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `mappings` é recriado a cada leitura da config; a chave estável evita o
    // laço de busca. `createMondayApi` idem, e vem do provider.
  }, [mappingsKey, userId, range.start, range.end, rangeValid, refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveEdit = useCallback(
    async (entry: MondayEntry, patch: MondayEntryPatch) => {
      const api = createMondayApi();
      try {
        // Mesmo serializador do envio (§9.4): rótulo que não existe na coluna
        // faz o Monday recusar a escrita inteira, e a guarda mora aqui.
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
        await api.changeColumnValues(entry.boardId, entry.itemId, {
          name: patch.name.trim(),
          ...values,
        });
        await showToast("success", "Atividade atualizada no Monday.");
        setEditingId(null);
        setRefreshSignal((n) => n + 1);
      } catch (err) {
        await showToast("error", err instanceof Error ? err.message : "Erro ao salvar no Monday.");
      }
    },
    [createMondayApi, userId]
  );

  const handleDelete = useCallback(
    async (entry: MondayEntry) => {
      const api = createMondayApi();
      try {
        await api.deleteItem(entry.itemId);
        // Sem limpar o rastreamento, o próximo envio reencontra o item apagado,
        // erra com `MondayNotFoundError` e repete o erro a cada execução.
        await mondayActivityItemRepo.deleteItem(entry.boardId, entry.itemId);
        await showToast("success", "Atividade excluída do Monday.");
        if (editingId === entry.itemId) setEditingId(null);
        setRefreshSignal((n) => n + 1);
      } catch (err) {
        await showToast("error", err instanceof Error ? err.message : "Erro ao excluir no Monday.");
      }
    },
    [createMondayApi, mondayActivityItemRepo, editingId]
  );

  return {
    entries,
    loading,
    editingId,
    setEditingId,
    refresh: () => setRefreshSignal((n) => n + 1),
    handleSaveEdit,
    handleDelete,
  };
}

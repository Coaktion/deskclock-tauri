import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  DownloadCloud,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { snapshotOf } from "@domain/usecases/monday/diffMondayItem";
import { findImportedMondayItems } from "@domain/usecases/monday/findImportedMondayItems";
import {
  importMondayItems,
  type ImportMondayItemInput,
} from "@domain/usecases/monday/importMondayItems";
import { listItemsOwnedBy } from "@domain/usecases/monday/listItemsOwnedBy";
import {
  buildImportRows,
  importColumnIds,
  resolveItemDefaults,
  type MondayImportRow,
} from "@domain/usecases/monday/mondayImportRows";
import { periodOverlaps, type MondayItemPeriod } from "@domain/usecases/monday/mondayItemPeriod";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { resolveTimelineByBoard } from "@domain/usecases/monday/resolveTimelineColumns";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { addDaysISO, todayISO, weekBoundsISO } from "@shared/utils/time";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";

type PeriodFilter = "today" | "week" | "next30";

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: "Hoje",
  week: "Esta semana",
  next30: "Próximos 30 dias",
};

/**
 * Janela de cada filtro.
 *
 * Todas olham para a frente, e não existe "tudo": planejamento é futuro, e um
 * item encerrado em julho só polui a lista de agosto. O recorte é aplicado sobre
 * o que já veio na busca — **trocar de filtro não custa chamada ao Monday**.
 */
function periodWindow(filter: PeriodFilter): { start: string; end: string } {
  const today = todayISO();
  switch (filter) {
    case "today":
      return { start: today, end: today };
    case "week":
      return weekBoundsISO();
    case "next30":
      return { start: today, end: addDaysISO(today, 30) };
  }
}

interface ItemEditState {
  categoryId: string | null;
  categoryName: string;
  billable: boolean;
  /** Hoje só o Project Stage, mas o formato é o da planejada. */
  customValues: CustomValues;
  expanded: boolean;
}

function periodLabel(period: MondayItemPeriod | null): string {
  if (!period) return "sem data";
  const fmt = (dayISO: string) => {
    const [, m, d] = dayISO.split("-");
    return `${d}/${m}`;
  };
  return period.startDayISO === period.endDayISO
    ? fmt(period.startDayISO)
    : `${fmt(period.startDayISO)} – ${fmt(period.endDayISO)}`;
}

/**
 * A sugestão do item (categoria pelo Activity Type, etapa pelo Project Stage)
 * vem de `resolveItemDefaults` — a mesma que a importação automática usa, para
 * as duas concordarem sobre o que um item vira.
 */
function defaultEditState(
  row: MondayImportRow,
  categories: Category[],
  stageField: CustomField | null
): ItemEditState {
  return { ...resolveItemDefaults(row, categories, stageField), expanded: false };
}

interface MondayImportModalProps {
  repo: IPlannedTaskRepository;
  projects: Project[];
  categories: Category[];
  onImported: (count: number) => void;
  onClose: () => void;
}

export function MondayImportModal({
  repo,
  projects,
  categories,
  onImported,
  onClose,
}: MondayImportModalProps) {
  const config = useAppConfig();
  const { createMondayApi } = useIntegrations();
  const { mondayImportedItemRepo } = useRepositories();
  // O workspace da integração, não o ativo: este modal é o gêmeo manual do
  // `useMondayItemTracker`, e os dois precisam criar no mesmo lugar. O dedupe de
  // `monday_imported_items` é chaveado por (item, workspace) — divergindo, a
  // mesma planejada nasceria duas vezes, cada uma invisível para o outro lado.
  const workspaceId = resolveIntegrationWorkspaceId(config.get("mondayDeskclockWorkspaceId"));
  const userId = config.get("mondayUserId");
  const { activeFields } = useCustomFields();

  /**
   * O Project Stage é campo personalizado (Fase 4), mas o Monday exige a etapa
   * no envio das horas — então ele aparece aqui, e só aqui, entre todos os
   * campos: importar sem etapa é adiar um preenchimento que ninguém faz depois.
   * Vazio enquanto a integração não tiver o campo configurado.
   */
  const stageField =
    activeFields.find((f) => f.id === config.get("mondayProjectStageFieldId")) ?? null;

  // Uma consulta para o modal inteiro: um hook por linha viraria dezenas.
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptionsFor = useCallback(
    (projectId: string | null) => categoriesFor(categories, projectId),
    [categoriesFor, categories]
  );

  const [period, setPeriod] = useState<PeriodFilter>("week");
  const [rows, setRows] = useState<MondayImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editMap, setEditMap] = useState<Map<string, ItemEditState>>(new Map());
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  /** Itens que já viraram planejada viva — ficam fora da lista, ver o efeito. */
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpenUrlAction, setAddOpenUrlAction] = useState(true);
  useEscapeToClose(onClose);

  // Só projeto com quadro de destino: sem ele não há board de onde ler itens.
  const mappings = useMemo(
    () =>
      normalizeProjectMappings(config.get("mondayProjectMapping")).filter((m) => !!m.mondayBoardId),
    [config.isLoaded] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * Só entram os boards cujo projeto existe **no workspace da integração**. O
   * vínculo mora na config e não sabe de workspace: importar por um board
   * mapeado noutro criaria planejadas apontando para projeto de fora.
   */
  const availableBoards = useMemo(
    () => mappings.filter((m) => projects.some((p) => p.id === m.deskclockProjectId)),
    [mappings, projects]
  );

  const unavailableCount = mappings.length - availableBoards.length;
  // A identidade do array muda a cada leitura da config; a chave estável evita
  // refazer a busca e descartar a seleção em curso.
  const boardsKey = availableBoards.map((m) => m.mondayBoardId).join(",");

  useEffect(() => {
    if (availableBoards.length === 0) return;
    if (!userId) {
      setError("Conecte o Monday novamente: falta o usuário da conta para filtrar os itens.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const api = createMondayApi();

    // A coluna de cronograma vem antes dos itens: é ela que diz quais colunas
    // pedir, e o template tem mais de sessenta. O id sai do cache do mapeamento
    // — só board que ainda não o tem custa uma leitura de schema, que era o que
    // este modal fazia para **todos** os boards a cada abertura.
    resolveTimelineByBoard(api, availableBoards)
      .then(async (timelineByBoard) => {
        const items = await listItemsOwnedBy(api, availableBoards, userId, {
          // O grupo Activities é o destino das horas que o DeskClock envia;
          // reimportá-lo duplicaria trabalho que já está registrado aqui.
          scope: "outsideActivities",
          columnIds: importColumnIds(availableBoards, timelineByBoard),
        });

        const next = buildImportRows(items, availableBoards, projects, timelineByBoard);

        // A janela de duplicatas cobre tudo o que os itens abrangem: um item de
        // agosto não teria como bater com a semana corrente.
        const days = next.flatMap((r) =>
          r.period ? [r.period.startDayISO, r.period.endDayISO] : []
        );
        const today = todayISO();
        const planned = await repo.findForWeek(
          days.length > 0 ? days.reduce((a, b) => (a < b ? a : b)) : today,
          days.length > 0 ? days.reduce((a, b) => (a > b ? a : b)) : today,
          workspaceId
        );

        // O que já tem planejada viva sai da lista: reimportar duplicaria a
        // tarefa e ainda reapontaria o vínculo para a cópia, deixando a original
        // órfã do sync. O badge "já existe" abaixo não cobre isto — ele compara
        // nomes, e renomear a planejada o apaga.
        const alreadyImported = await findImportedMondayItems(
          { trackedRepo: mondayImportedItemRepo, plannedRepo: repo },
          next.map((r) => r.item.id),
          workspaceId
        );

        if (cancelled) return;
        setRows(next);
        setImported(alreadyImported);
        setExistingNames(new Set(planned.map((t) => t.name.toLowerCase().trim())));
        // O mapa guarda só o que o usuário editou; a sugestão é derivada na
        // hora, a cada render. Semeá-la aqui congelaria o estado do
        // carregamento: os campos personalizados chegam em paralelo, e uma
        // resposta rápida do Monday deixaria a etapa por preencher sem nada
        // que explicasse o porquê.
        setEditMap(new Map());
        setSelected(new Set());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao buscar itens dos boards.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `projects`, `categories` e `repo` vêm de providers e mudariam de
    // identidade a cada render, refazendo a busca. O filtro de período fica de
    // fora de propósito: ele recorta o que já veio, sem nova ida ao Monday.
  }, [boardsKey, workspaceId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * O recorte de período e, dentro dele, a separação entre o que ainda cabe
   * importar e o que já foi. O segundo número existe para o rodapé: some da
   * lista, mas não sem dizer para onde foi.
   */
  const [visibleRows, hiddenImported] = useMemo(() => {
    const window = periodWindow(period);
    // Item sem cronograma no board entra em qualquer recorte: ele nasce no dia
    // corrente e escondê-lo por falta de data seria escondê-lo para sempre.
    const inWindow = rows.filter(
      (r) => !r.period || periodOverlaps(r.period, window.start, window.end)
    );
    return [
      inWindow.filter((r) => !imported.has(r.item.id)),
      inWindow.filter((r) => imported.has(r.item.id)).length,
    ] as const;
  }, [rows, period, imported]);

  /** Um grupo por projeto, que é o que o usuário reconhece — board é detalhe. */
  const groups = useMemo(() => {
    const map = new Map<string, MondayImportRow[]>();
    for (const row of visibleRows) {
      map.set(row.project.name, [...(map.get(row.project.name) ?? []), row]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map(
        ([name, list]) =>
          [
            name,
            [...list].sort((a, b) =>
              (a.period?.startDayISO ?? "9999").localeCompare(b.period?.startDayISO ?? "9999")
            ),
          ] as const
      );
  }, [visibleRows]);

  // Filtrar não deixa selecionado nada fora da tela: o que o botão promete
  // importar é exatamente o que está à vista (§5.6).
  const selectedVisible = visibleRows.filter((r) => selected.has(r.item.id));

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupRows: readonly MondayImportRow[]) {
    const allSelected = groupRows.every((r) => selected.has(r.item.id));
    setSelected((prev) => {
      const next = new Set(prev);
      groupRows.forEach((r) => (allSelected ? next.delete(r.item.id) : next.add(r.item.id)));
      return next;
    });
  }

  function updateEdit(id: string, state: ItemEditState) {
    setEditMap((prev) => new Map(prev).set(id, state));
  }

  async function handleImport() {
    const inputs: ImportMondayItemInput[] = selectedVisible.map((r) => {
      const edit = editMap.get(r.item.id) ?? defaultEditState(r, categories, stageField);
      return {
        item: r.item,
        projectId: r.project.id,
        categoryId: edit.categoryId,
        billable: edit.billable,
        period: r.period,
        customValues: edit.customValues,
      };
    });

    if (inputs.length === 0) return;

    setImporting(true);
    const nowISO = new Date().toISOString();
    try {
      const planned = await importMondayItems(repo, inputs, nowISO, workspaceId, addOpenUrlAction);
      // O import manual grava o mesmo rastreamento do automático: sem isso, a
      // varredura seguinte não reconheceria estes itens e criaria tudo de novo.
      for (const [index, row] of selectedVisible.entries()) {
        await mondayImportedItemRepo.upsert({
          mondayItemId: row.item.id,
          workspaceId,
          boardId: row.item.boardId,
          plannedTaskId: planned[index].id,
          snapshot: snapshotOf(row),
          importedAt: nowISO,
          updatedAt: nowISO,
        });
      }
      if (planned.length > 0) void emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      onImported(planned.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar itens.");
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <DownloadCloud size={16} className="text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-100">Importar itens do Monday</h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                Somente os seus, nos {availableBoards.length} board(s) vinculados
              </p>
            </div>
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg">
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  period === p
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {availableBoards.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-12 px-4">
              {mappings.length === 0
                ? "Nenhum board vinculado. Importe os projetos na tela de Integrações primeiro."
                : "Os boards vinculados apontam para projetos de outro workspace. Confira o workspace escolhido na integração ou importe os projetos nele."}
            </p>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Buscando itens…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 m-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {!loading && !error && availableBoards.length > 0 && visibleRows.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-12 px-4">
              {rows.length === 0
                ? "Nenhuma tarefa sua nos boards vinculados, fora do grupo Activities."
                : hiddenImported > 0
                  ? `Todas as suas ${hiddenImported} tarefas deste período já estão no planejamento.`
                  : `Nenhuma das suas ${rows.length} tarefas cai neste período. Tente um filtro mais largo.`}
            </p>
          )}

          {!loading &&
            groups.map(([projectName, groupRows]) => {
              const allSelected = groupRows.every((r) => selected.has(r.item.id));
              const someSelected = !allSelected && groupRows.some((r) => selected.has(r.item.id));
              return (
                <div key={projectName} className="border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/40 sticky top-0 z-10">
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupRows)}
                      className="shrink-0 text-gray-400 hover:text-gray-200"
                    >
                      {allSelected ? (
                        <CheckSquare size={13} />
                      ) : (
                        <Square size={13} className={someSelected ? "opacity-50" : ""} />
                      )}
                    </button>
                    <span className="text-xs font-semibold text-gray-300 flex-1 truncate">
                      {projectName}
                    </span>
                    <span className="text-xs text-gray-600">
                      {groupRows.filter((r) => selected.has(r.item.id)).length}/{groupRows.length}
                    </span>
                  </div>

                  {groupRows.map((row) => (
                    <ItemRow
                      key={row.item.id}
                      row={row}
                      selected={selected.has(row.item.id)}
                      editState={
                        editMap.get(row.item.id) ?? defaultEditState(row, categories, stageField)
                      }
                      categories={categories}
                      categoryOptionsFor={categoryOptionsFor}
                      stageField={stageField}
                      isDuplicate={existingNames.has(row.item.name.toLowerCase().trim())}
                      onToggleSelect={() => toggleItem(row.item.id)}
                      onEditChange={(s) => updateEdit(row.item.id, s)}
                    />
                  ))}
                </div>
              );
            })}
        </div>

        {visibleRows.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-3 border-t border-gray-800 shrink-0">
            {unavailableCount > 0 && (
              <p className="text-xs text-gray-600">
                {unavailableCount} board(s) vinculados a projetos de outro workspace estão fora
                desta lista.
              </p>
            )}
            {hiddenImported > 0 && (
              <p className="text-xs text-gray-600">
                {hiddenImported} item(ns) já importado(s) estão fora desta lista.
              </p>
            )}
            {!stageField && (
              <p className="text-xs text-gray-600">
                Project Stage não aparece nos itens: crie o campo personalizado a partir da coluna
                do board, em Integrações → Monday → Importação de dados.
              </p>
            )}
            <label
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setAddOpenUrlAction((v) => !v)}
            >
              <div
                className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
                  addOpenUrlAction ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    addOpenUrlAction ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </div>
              <span className="text-xs text-gray-400">
                Adicionar uma ação de abrir o item no Monday
              </span>
            </label>

            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importing || selectedVisible.length === 0}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {importing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Importando…
                  </>
                ) : (
                  <>Importar selecionados ({selectedVisible.length})</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ItemRowProps {
  row: MondayImportRow;
  selected: boolean;
  editState: ItemEditState;
  categories: Category[];
  /** Recorte de categorias do Project do grupo — ver `useProjectCategoryMap`. */
  categoryOptionsFor: (projectId: string | null) => Category[];
  /** Null enquanto a integração não tiver o campo de etapa configurado. */
  stageField: CustomField | null;
  isDuplicate: boolean;
  onToggleSelect: () => void;
  onEditChange: (s: ItemEditState) => void;
}

function ItemRow({
  row,
  selected,
  editState,
  categories,
  categoryOptionsFor,
  stageField,
  isDuplicate,
  onToggleSelect,
  onEditChange,
}: ItemRowProps) {
  const stageLabel = stageField
    ? (stageField.options.find((o) => o.id === editState.customValues[stageField.id])?.label ?? "")
    : "";
  return (
    <div
      className="border-b border-gray-800 last:border-0 cursor-pointer hover:bg-gray-800/30 transition-colors"
      onClick={() => onEditChange({ ...editState, expanded: !editState.expanded })}
    >
      <div className="flex items-start gap-2 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 accent-blue-500 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-gray-100 truncate">{row.item.name}</span>
            {isDuplicate && (
              <span
                title="Já existe uma tarefa planejada com este nome"
                className="flex items-center gap-0.5 px-1 py-0.5 text-xs leading-none rounded bg-yellow-900/50 text-yellow-400 shrink-0"
              >
                <AlertTriangle size={9} />
                já existe
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {periodLabel(row.period)}
            {editState.categoryName && (
              <span className="ml-2 text-blue-400">{editState.categoryName}</span>
            )}
            {stageLabel && <span className="ml-2 text-gray-400">{stageLabel}</span>}
          </p>
        </div>
        <span className="p-1 text-gray-600 shrink-0">
          {editState.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {editState.expanded && (
        <div className="mt-1 mx-4 mb-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <Autocomplete
            value={editState.categoryName}
            onChange={(v) => onEditChange({ ...editState, categoryName: v, categoryId: null })}
            onSelect={(o) => {
              const category = categories.find((c) => c.id === o.id);
              onEditChange({
                ...editState,
                categoryId: o.id,
                categoryName: o.name,
                billable: category?.defaultBillable ?? editState.billable,
              });
            }}
            options={categoryOptionsFor(row.project.id)}
            placeholder="Categoria"
          />
          {/* Um campo personalizado só — o mesmo componente dos cinco
              formulários, para a etapa se parecer aqui com o que ela é lá. */}
          {stageField && (
            <CustomFieldInputs
              fields={[stageField]}
              values={editState.customValues}
              onChange={(customValues) => onEditChange({ ...editState, customValues })}
              compact
            />
          )}
        </div>
      )}
    </div>
  );
}

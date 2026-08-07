import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { CalendarEvent, ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { dedupeCalendarEvents } from "@domain/usecases/plannedTasks/DedupeCalendarEvents";
import {
  importCalendarEvents,
  type ImportEventInput,
} from "@domain/usecases/plannedTasks/ImportCalendarEvents";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { findByNameCaseInsensitive, parseCalendarMetadata } from "@shared/utils/calendarMetadata";
import { emit } from "@tauri-apps/api/event";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  Repeat2,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface EventEditState {
  projectId: string | null;
  projectName: string;
  categoryId: string | null;
  categoryName: string;
  scheduleType: "specific_date" | "recurring";
  recurringDays: number[];
  expanded: boolean;
}

function defaultEditState(
  event: CalendarEvent,
  projects: Project[],
  categories: Category[]
): EventEditState {
  const hasRecurring = !!event.suggestedRecurringDays?.length || !!event.recurringEventId;
  const meta = parseCalendarMetadata(event.description);
  const matchedProject = findByNameCaseInsensitive(meta.projectName, projects);
  const matchedCategory = findByNameCaseInsensitive(meta.categoryName, categories);
  return {
    projectId: matchedProject?.id ?? null,
    projectName: matchedProject?.name ?? "",
    categoryId: matchedCategory?.id ?? null,
    categoryName: matchedCategory?.name ?? "",
    scheduleType: hasRecurring ? "recurring" : "specific_date",
    recurringDays: event.suggestedRecurringDays ?? [],
    expanded: false,
  };
}

function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const list = map.get(evt.date) ?? [];
    list.push(evt);
    map.set(evt.date, list);
  }
  return map;
}

function getMondayISO(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const fmt2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
}

function getWeekDays(mondayISO: string): string[] {
  const fmt2 = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayISO + "T12:00:00");
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
  });
}

function weekRangeLabel(mondayISO: string): string {
  const monday = new Date(mondayISO + "T12:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function weekRangeLabelLong(mondayISO: string): string {
  const monday = new Date(mondayISO + "T12:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  return `${fmt(monday)} a ${fmt(sunday)}`;
}

/* ── Editor inline por evento ── */

interface EventEditorProps {
  event: CalendarEvent;
  state: EventEditState;
  projects: Project[];
  /** Recorte de categorias do projeto da linha — ver `useProjectCategoryMap`. */
  categoryOptionsFor: (projectId: string | null) => Category[];
  onChange: (s: EventEditState) => void;
}

function EventEditor({ event, state, projects, categoryOptionsFor, onChange }: EventEditorProps) {
  function toggleDay(day: number) {
    const next = state.recurringDays.includes(day)
      ? state.recurringDays.filter((d) => d !== day)
      : [...state.recurringDays, day].sort((a, b) => a - b);
    onChange({ ...state, recurringDays: next });
  }

  return (
    <div className="mt-1 mx-4 mb-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <Autocomplete
        value={state.projectName}
        onChange={(v) => onChange({ ...state, projectName: v, projectId: null })}
        onSelect={(o) =>
          // Projeto novo zera a categoria. Só aqui: o `onChange` acima dispara a
          // cada tecla, e limpar ali apagaria a categoria enquanto se digita.
          onChange({
            ...state,
            projectId: o.id,
            projectName: o.name,
            categoryId: null,
            categoryName: "",
          })
        }
        options={projects}
        placeholder="Projeto"
      />
      <Autocomplete
        value={state.categoryName}
        onChange={(v) => onChange({ ...state, categoryName: v, categoryId: null })}
        onSelect={(o) => onChange({ ...state, categoryId: o.id, categoryName: o.name })}
        options={categoryOptionsFor(state.projectId)}
        placeholder="Categoria"
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">Agendamento:</span>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => onChange({ ...state, scheduleType: "specific_date" })}
            className={`px-2 py-0.5 text-xs rounded-lg transition-colors ${
              state.scheduleType === "specific_date"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Específica
          </button>
          <button
            onClick={() => {
              const days = state.recurringDays.length
                ? state.recurringDays
                : (event.suggestedRecurringDays ?? []);
              onChange({ ...state, scheduleType: "recurring", recurringDays: days });
            }}
            className={`px-2 py-0.5 text-xs rounded-lg transition-colors ${
              state.scheduleType === "recurring"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Recorrente
          </button>
        </div>
      </div>

      {state.scheduleType === "recurring" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0 mr-1">Dias:</span>
          {DAY_LABELS.map((label, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                state.recurringDays.includes(idx)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-500 hover:text-gray-200"
              }`}
            >
              {label[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Linha de evento ── */

interface EventRowProps {
  event: CalendarEvent;
  selected: boolean;
  editState: EventEditState;
  projects: Project[];
  categoryOptionsFor: (projectId: string | null) => Category[];
  isDeduped: boolean;
  isDuplicateOfExisting: boolean;
  /**
   * Dias que a planejada terá de fato — os desta linha mais os das ocorrências
   * que ela absorveu. Fica no resumo, e não no editor: ali se edita o dia deste
   * evento, e a linha diz o que será criado.
   */
  effectiveRecurringDays: number[];
  onToggleSelect: () => void;
  onEditChange: (s: EventEditState) => void;
}

function EventRow({
  event,
  selected,
  editState,
  projects,
  categoryOptionsFor,
  isDeduped,
  isDuplicateOfExisting,
  effectiveRecurringDays,
  onToggleSelect,
  onEditChange,
}: EventRowProps) {
  const hasEdits =
    editState.projectId !== null ||
    editState.categoryId !== null ||
    (editState.scheduleType === "recurring" && editState.recurringDays.length > 0);

  return (
    <div
      className={`border-b border-gray-800 last:border-0 cursor-pointer hover:bg-gray-800/30 transition-colors ${isDeduped ? "opacity-60" : ""}`}
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
            <span className="text-sm text-gray-100 truncate">{event.title}</span>
            {event.recurringEventId && (
              <span title="Evento recorrente">
                <Repeat2 size={11} className="text-blue-400 shrink-0" />
              </span>
            )}
            {isDeduped && (
              <span
                title="Mesma tarefa recorrente já incluída — não criará tarefa separada"
                className="px-1 py-0.5 text-[10px] leading-none rounded bg-gray-700 text-gray-400 shrink-0"
              >
                recorrente
              </span>
            )}
            {isDuplicateOfExisting && (
              <span
                title="Já existe uma tarefa planejada com este nome"
                className="flex items-center gap-0.5 px-1 py-0.5 text-[10px] leading-none rounded bg-yellow-900/50 text-yellow-400 shrink-0"
              >
                <AlertTriangle size={9} />
                já existe
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {event.allDay
              ? "Dia todo"
              : event.startTime
                ? `${event.startTime}${event.endTime ? ` – ${event.endTime}` : ""}`
                : ""}
            {hasEdits && (
              <span className="ml-2 text-blue-400">
                {editState.projectName || ""}
                {editState.scheduleType === "recurring" && effectiveRecurringDays.length > 0
                  ? ` · ${[...effectiveRecurringDays]
                      .sort((a, b) => a - b)
                      .map((d) => DAY_LABELS[d][0])
                      .join("")}`
                  : ""}
              </span>
            )}
          </p>
        </div>
        <span className="p-1 text-gray-600 shrink-0">
          {editState.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {editState.expanded && (
        <EventEditor
          event={event}
          state={editState}
          projects={projects}
          categoryOptionsFor={categoryOptionsFor}
          onChange={onEditChange}
        />
      )}
    </div>
  );
}

/* ── Modal principal ── */

interface ImportCalendarModalProps {
  importer: ICalendarImporter;
  repo: IPlannedTaskRepository;
  defaultFromISO: string;
  defaultToISO: string;
  projects: Project[];
  categories: Category[];
  onImported: (count: number) => void;
  onClose: () => void;
}

export function ImportCalendarModal({
  importer,
  repo,
  defaultFromISO,
  defaultToISO,
  projects,
  categories,
  onImported,
  onClose,
}: ImportCalendarModalProps) {
  // Destino escolhido na integração da Agenda. Vale **só** para este import
  // manual: o rastreio automático de reuniões continua criando no workspace
  // ativo — decisão registrada (§5.7), não descuido.
  const config = useAppConfig();
  const workspaceId = resolveIntegrationWorkspaceId(config.get("calendarDeskclockWorkspaceId"));
  // Uma consulta para o modal inteiro: um hook por linha viraria dezenas.
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptionsFor = useCallback(
    (projectId: string | null) => categoriesFor(categories, projectId),
    [categoriesFor, categories]
  );
  const [fromDate, setFromDate] = useState(defaultFromISO.slice(0, 10));
  const [toDate, setToDate] = useState(defaultToISO.slice(0, 10));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editMap, setEditMap] = useState<Map<string, EventEditState>>(new Map());
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpenUrlAction, setAddOpenUrlAction] = useState(true);
  useEscapeToClose(onClose);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedWeek(null);
    const fromISO = new Date(fromDate + "T00:00:00").toISOString();
    const toISO = new Date(toDate + "T23:59:59").toISOString();
    // A duplicata é procurada no workspace **de destino** do import, não em
    // todos: sem o escopo, evento já importado noutro workspace vinha marcado
    // "já existe" e desmarcado aqui, onde ele ainda não foi importado.
    //
    // O `findForWeek` recebe **dia**, não instante, e é o que todos os outros
    // chamadores passam: ele compara com `schedule_date`, que é "AAAA-MM-DD" no
    // banco. Passando o instante, o SQLite comparava `"2026-08-03"` com
    // `"2026-08-03T03:00:00.000Z"` como texto — o mais curto é prefixo do outro,
    // logo **menor** —, e a planejada do **primeiro dia do intervalo** ficava de
    // fora da busca. Na prática, o evento da segunda-feira nunca era marcado
    // "já existe", vinha selecionado e era importado de novo a cada import; do
    // segundo dia em diante o chip funcionava. O fim escapava por sorte, porque
    // ali ser "menor que o instante" é justamente o que se queria.
    Promise.all([
      importer.getEvents(fromISO, toISO),
      repo.findForWeek(fromDate, toDate, workspaceId),
    ])
      .then(([evts, existingTasks]) => {
        const names = new Set(existingTasks.map((t) => t.name.toLowerCase().trim()));
        setExistingNames(names);
        setEvents(evts);
        const duplicateIds = new Set(
          evts.filter((e) => names.has(e.title.toLowerCase().trim())).map((e) => e.id)
        );
        setSelected(new Set(evts.filter((e) => !duplicateIds.has(e.id)).map((e) => e.id)));
        const map = new Map<string, EventEditState>();
        evts.forEach((e) => map.set(e.id, defaultEditState(e, projects, categories)));
        setEditMap(map);
        if (evts.length > 0) {
          const firstDate = [...evts].sort((a, b) => a.date.localeCompare(b.date))[0].date;
          setSelectedWeek(getMondayISO(firstDate));
        }
      })
      .catch((err) => {
        const msg =
          err instanceof Error
            ? err.message || err.toString()
            : typeof err === "string"
              ? err
              : JSON.stringify(err);
        setError(msg || "Erro ao buscar eventos do Google Agenda.");
      })
      .finally(() => setLoading(false));
  }, [fromDate, toDate, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => groupByDate(events), [events]);

  const allWeekKeys = useMemo(() => {
    const weeks = new Set(events.map((e) => getMondayISO(e.date)));
    return [...weeks].sort();
  }, [events]);

  const selectedWeekDays = useMemo(() => {
    if (!selectedWeek) return [];
    return getWeekDays(selectedWeek).filter((d) => d >= fromDate && d <= toDate);
  }, [selectedWeek, fromDate, toDate]);

  const selectedWeekEvents = useMemo(() => {
    if (!selectedWeek) return [];
    return events.filter((e) => getMondayISO(e.date) === selectedWeek);
  }, [events, selectedWeek]);

  // Nome + horário, não o id da série do Google — ver `dedupeCalendarEvents`.
  const { dedupedIds: dedupedEventIds, daysById: mergedDaysById } = useMemo(
    () =>
      dedupeCalendarEvents(
        events
          .filter((e) => selected.has(e.id))
          .map((e) => {
            const edit = editMap.get(e.id);
            return {
              id: e.id,
              title: e.title,
              startTime: e.startTime,
              endTime: e.endTime,
              isRecurring: edit?.scheduleType === "recurring",
              recurringDays: edit?.recurringDays ?? [],
            };
          })
      ),
    [events, selected, editMap]
  );

  const effectiveTaskCount = selected.size - dedupedEventIds.size;

  function toggleEvent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDayEvents(date: string) {
    const dayEvents = grouped.get(date) ?? [];
    const allDaySelected = dayEvents.every((e) => selected.has(e.id));
    setSelected((prev) => {
      const next = new Set(prev);
      dayEvents.forEach((e) => {
        if (allDaySelected) next.delete(e.id);
        else next.add(e.id);
      });
      return next;
    });
  }

  function toggleWeekEvents() {
    const allWeekSelected = selectedWeekEvents.every((e) => selected.has(e.id));
    setSelected((prev) => {
      const next = new Set(prev);
      selectedWeekEvents.forEach((e) => {
        if (allWeekSelected) next.delete(e.id);
        else next.add(e.id);
      });
      return next;
    });
  }

  function updateEdit(id: string, state: EventEditState) {
    setEditMap((prev) => new Map(prev).set(id, state));
  }

  async function handleImport() {
    const inputs: ImportEventInput[] = events
      .filter((e) => selected.has(e.id) && !dedupedEventIds.has(e.id))
      .map((e) => {
        const edit = editMap.get(e.id)!;
        return {
          event: e,
          projectId: edit.projectId,
          categoryId: edit.categoryId,
          scheduleType: edit.scheduleType,
          // Os dias das ocorrências absorvidas entram aqui: a série partida em
          // dois ids pode cobrir dias diferentes em cada metade.
          recurringDays: mergedDaysById.get(e.id) ?? edit.recurringDays,
        };
      });

    if (inputs.length === 0) return;

    setImporting(true);
    try {
      const count = (
        await importCalendarEvents(
          repo,
          inputs,
          new Date().toISOString(),
          workspaceId,
          addOpenUrlAction
        )
      ).length;
      if (count > 0) void emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      onImported(count);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message || err.toString()
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      setError(msg || "Erro ao importar eventos.");
      setImporting(false);
    }
  }

  function renderDayGroup(date: string) {
    const dayEvents = grouped.get(date) ?? [];
    const hasEvents = dayEvents.length > 0;
    const allDaySelected = hasEvents && dayEvents.every((e) => selected.has(e.id));
    const someDaySelected = !allDaySelected && dayEvents.some((e) => selected.has(e.id));

    const [year, month, day] = date.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    const dayOfWeek = d.toLocaleDateString("pt-BR", { weekday: "long" });
    const dayShort = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

    return (
      <div key={date} className="border-b border-gray-800 last:border-0">
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/40">
          {hasEvents ? (
            <button
              type="button"
              onClick={() => toggleDayEvents(date)}
              className="shrink-0 text-gray-400 hover:text-gray-200"
            >
              {allDaySelected ? (
                <CheckSquare size={13} />
              ) : someDaySelected ? (
                <Square size={13} className="opacity-50" />
              ) : (
                <Square size={13} />
              )}
            </button>
          ) : (
            <div className="w-[13px] shrink-0" />
          )}
          <span className="text-xs font-semibold text-gray-300 capitalize flex-1">
            {dayOfWeek}
            <span className="ml-1.5 font-normal text-gray-500">{dayShort}</span>
          </span>
          {hasEvents && (
            <span className="text-xs text-gray-600">
              {dayEvents.filter((e) => selected.has(e.id)).length}/{dayEvents.length}
            </span>
          )}
        </div>

        {hasEvents ? (
          dayEvents.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              selected={selected.has(event.id)}
              editState={editMap.get(event.id) ?? defaultEditState(event, projects, categories)}
              projects={projects}
              categoryOptionsFor={categoryOptionsFor}
              isDeduped={dedupedEventIds.has(event.id)}
              isDuplicateOfExisting={existingNames.has(event.title.toLowerCase().trim())}
              effectiveRecurringDays={
                mergedDaysById.get(event.id) ??
                editMap.get(event.id)?.recurringDays ??
                event.suggestedRecurringDays ??
                []
              }
              onToggleSelect={() => toggleEvent(event.id)}
              onEditChange={(s) => updateEdit(event.id, s)}
            />
          ))
        ) : (
          <p className="text-xs text-gray-700 italic px-4 py-2">Nenhum evento neste dia</p>
        )}
      </div>
    );
  }

  const allWeekSelected =
    selectedWeekEvents.length > 0 && selectedWeekEvents.every((e) => selected.has(e.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <Calendar size={16} className="text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-100 flex-1">
              Importar do Google Calendar
            </h2>
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="shrink-0">De</span>
            <DatePickerInput
              value={fromDate}
              onChange={(d) => {
                setFromDate(d);
                if (d > toDate) setToDate(d);
              }}
              className="flex-1"
            />
            <span className="shrink-0">até</span>
            <DatePickerInput
              value={toDate}
              onChange={(d) => {
                setToDate(d);
                if (d < fromDate) setFromDate(d);
              }}
              className="flex-1"
            />
          </div>
        </div>

        {/* Corpo */}
        {loading || error || events.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Buscando eventos…</span>
              </div>
            )}
            {!loading && error && (
              <div className="flex items-start gap-2 m-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}
            {!loading && !error && (
              <p className="text-sm text-gray-500 text-center py-12">
                Nenhum evento encontrado neste período.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar — lista de semanas */}
            <div className="w-48 shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900/50 flex flex-col">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-600 border-b border-gray-800">
                Semanas
              </div>
              {allWeekKeys.map((weekKey) => {
                const count = events.filter((e) => getMondayISO(e.date) === weekKey).length;
                const selCount = events.filter(
                  (e) => getMondayISO(e.date) === weekKey && selected.has(e.id)
                ).length;
                const isActive = selectedWeek === weekKey;
                return (
                  <button
                    key={weekKey}
                    onClick={() => setSelectedWeek(weekKey)}
                    className={`w-full text-left flex items-start gap-2 px-3 py-2.5 transition-colors border-l-2 ${
                      isActive
                        ? "bg-gray-800 border-blue-500"
                        : "border-transparent hover:bg-gray-800/50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-medium truncate ${isActive ? "text-gray-100" : "text-gray-400"}`}
                      >
                        {weekRangeLabel(weekKey)}
                      </div>
                      <div className="text-[10px] text-gray-600 mt-0.5">seg a dom</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0 pt-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          isActive ? "bg-blue-900/50 text-blue-400" : "bg-gray-800 text-gray-600"
                        }`}
                      >
                        {count} ev.
                      </span>
                      {selCount > 0 && (
                        <span className="text-[10px] text-green-500">{selCount} ✓</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Painel — dias e eventos da semana selecionada */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {selectedWeek ? (
                <>
                  <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-gray-800/90 backdrop-blur-sm border-b border-gray-800 shrink-0">
                    <span className="text-xs font-semibold text-gray-200 flex-1 capitalize">
                      {weekRangeLabelLong(selectedWeek)}
                    </span>
                    <button
                      onClick={toggleWeekEvents}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                    >
                      {allWeekSelected ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  </div>
                  {selectedWeekDays.map((date) => renderDayGroup(date))}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-600">
                    <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Selecione uma semana</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && events.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-3 border-t border-gray-800 shrink-0">
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
                Adicionar automaticamente uma ação de abrir URL do evento
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
                disabled={importing || effectiveTaskCount === 0}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {importing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Importando…
                  </>
                ) : effectiveTaskCount < selected.size ? (
                  <>
                    Importar {selected.size} evento(s) → {effectiveTaskCount} tarefa(s)
                  </>
                ) : (
                  <>Importar selecionados ({selected.size})</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

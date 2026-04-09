import { useEffect, useMemo, useState } from "react";
import {
  X, Loader2, Calendar, AlertCircle, CheckSquare, Square,
  ChevronDown, ChevronRight, Repeat2,
} from "lucide-react";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { importCalendarEvents, type ImportEventInput } from "@domain/usecases/plannedTasks/ImportCalendarEvents";
import { Autocomplete } from "@presentation/components/Autocomplete";

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

function defaultEditState(event: CalendarEvent): EventEditState {
  const hasRecurring = !!event.suggestedRecurringDays?.length;
  return {
    projectId: null,
    projectName: "",
    categoryId: null,
    categoryName: "",
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

/* ── Editor inline por evento ── */

interface EventEditorProps {
  event: CalendarEvent;
  state: EventEditState;
  projects: Project[];
  categories: Category[];
  onChange: (s: EventEditState) => void;
}

function EventEditor({ event, state, projects, categories, onChange }: EventEditorProps) {
  function toggleDay(day: number) {
    const next = state.recurringDays.includes(day)
      ? state.recurringDays.filter((d) => d !== day)
      : [...state.recurringDays, day].sort((a, b) => a - b);
    onChange({ ...state, recurringDays: next });
  }

  return (
    <div className="mt-1 mx-4 mb-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Projeto */}
      <Autocomplete
        value={state.projectName}
        onChange={(v) => onChange({ ...state, projectName: v, projectId: null })}
        onSelect={(o) => onChange({ ...state, projectId: o.id, projectName: o.name })}
        options={projects}
        placeholder="Projeto"
      />
      {/* Categoria */}
      <Autocomplete
        value={state.categoryName}
        onChange={(v) => onChange({ ...state, categoryName: v, categoryId: null })}
        onSelect={(o) => onChange({ ...state, categoryId: o.id, categoryName: o.name })}
        options={categories}
        placeholder="Categoria"
      />

      {/* Tipo de agendamento */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">Agendamento:</span>
        <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
          <button
            onClick={() => onChange({ ...state, scheduleType: "specific_date" })}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
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
                : event.suggestedRecurringDays ?? [];
              onChange({ ...state, scheduleType: "recurring", recurringDays: days });
            }}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              state.scheduleType === "recurring"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Recorrente
          </button>
        </div>
      </div>

      {/* Seletor de dias da semana */}
      {state.scheduleType === "recurring" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0 mr-1">Dias:</span>
          {DAY_LABELS.map((label, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              className={`w-7 h-7 text-xs rounded transition-colors ${
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
  categories: Category[];
  onToggleSelect: () => void;
  onEditChange: (s: EventEditState) => void;
}

function EventRow({
  event, selected, editState, projects, categories, onToggleSelect, onEditChange,
}: EventRowProps) {
  const hasEdits =
    editState.projectId !== null ||
    editState.categoryId !== null ||
    (editState.scheduleType === "recurring" && editState.recurringDays.length > 0);

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
            <span className="text-sm text-gray-100 truncate">{event.title}</span>
            {event.recurringEventId && (
              <span title="Evento recorrente">
                <Repeat2 size={11} className="text-blue-400 shrink-0" />
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
                {editState.scheduleType === "recurring" && editState.recurringDays.length > 0
                  ? ` · ${editState.recurringDays.map((d) => DAY_LABELS[d][0]).join("")}`
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
          categories={categories}
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
  fromISO: string;
  toISO: string;
  weekLabel: string;
  projects: Project[];
  categories: Category[];
  onImported: (count: number) => void;
  onClose: () => void;
}

export function ImportCalendarModal({
  importer, repo, fromISO, toISO, weekLabel,
  projects, categories, onImported, onClose,
}: ImportCalendarModalProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editMap, setEditMap] = useState<Map<string, EventEditState>>(new Map());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    importer
      .getEvents(fromISO, toISO)
      .then((evts) => {
        setEvents(evts);
        setSelected(new Set(evts.map((e) => e.id)));
        const map = new Map<string, EventEditState>();
        evts.forEach((e) => map.set(e.id, defaultEditState(e)));
        setEditMap(map);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao buscar eventos."))
      .finally(() => setLoading(false));
  }, [fromISO, toISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => groupByDate(events), [events]);
  const sortedDates = useMemo(() => [...grouped.keys()].sort(), [grouped]);

  function toggleAll() {
    setSelected(selected.size === events.length ? new Set() : new Set(events.map((e) => e.id)));
  }

  function toggleEvent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleDayEvents(date: string) {
    const dayEvents = grouped.get(date) ?? [];
    const allDaySelected = dayEvents.every((e) => selected.has(e.id));
    setSelected((prev) => {
      const next = new Set(prev);
      dayEvents.forEach((e) => (allDaySelected ? next.delete(e.id) : next.add(e.id)));
      return next;
    });
  }

  function toggleDayCollapse(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  function updateEdit(id: string, state: EventEditState) {
    setEditMap((prev) => new Map(prev).set(id, state));
  }

  async function handleImport() {
    const inputs: ImportEventInput[] = events
      .filter((e) => selected.has(e.id))
      .map((e) => {
        const edit = editMap.get(e.id)!;
        return {
          event: e,
          projectId: edit.projectId,
          categoryId: edit.categoryId,
          scheduleType: edit.scheduleType,
          recurringDays: edit.recurringDays,
        };
      });

    if (inputs.length === 0) return;

    setImporting(true);
    try {
      const count = await importCalendarEvents(repo, inputs, new Date().toISOString());
      onImported(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar eventos.");
      setImporting(false);
    }
  }

  const allSelected = events.length > 0 && selected.size === events.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          <Calendar size={16} className="text-blue-400" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">Importar do Google Calendar</h2>
            <p className="text-xs text-gray-500">{weekLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Corpo */}
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

          {!loading && !error && events.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-12">
              Nenhum evento encontrado nesta semana.
            </p>
          )}

          {!loading && !error && events.length > 0 && (
            <>
              {/* Selecionar todos */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200"
                >
                  {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                  <span className="text-gray-600">({events.length})</span>
                </button>
              </div>

              {/* Grupos por dia (accordion) */}
              {sortedDates.map((date) => {
                const dayEvents = grouped.get(date)!;
                const isCollapsed = collapsedDays.has(date);
                const allDaySelected = dayEvents.every((e) => selected.has(e.id));
                const someDaySelected = !allDaySelected && dayEvents.some((e) => selected.has(e.id));

                const [year, month, day] = date.split("-").map(Number);
                const d = new Date(year, month - 1, day);
                const dayLabel = d.toLocaleDateString("pt-BR", {
                  weekday: "long", day: "2-digit", month: "2-digit",
                });

                return (
                  <div key={date} className="border-b border-gray-800 last:border-0">
                    {/* Header do dia (clicável para colapsar) */}
                    <div
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 cursor-pointer hover:bg-gray-800 transition-colors select-none"
                      onClick={() => toggleDayCollapse(date)}
                    >
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleDayEvents(date); }}
                        className="shrink-0 text-gray-400 hover:text-gray-200"
                      >
                        {allDaySelected
                          ? <CheckSquare size={13} />
                          : someDaySelected
                          ? <Square size={13} className="opacity-50" />
                          : <Square size={13} />}
                      </button>
                      <span className="text-xs font-medium text-gray-300 capitalize flex-1">
                        {dayLabel}
                      </span>
                      <span className="text-xs text-gray-600 mr-1">
                        {dayEvents.filter((e) => selected.has(e.id)).length}/{dayEvents.length}
                      </span>
                      {isCollapsed ? <ChevronRight size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
                    </div>

                    {/* Eventos do dia */}
                    {!isCollapsed && dayEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        selected={selected.has(event.id)}
                        editState={editMap.get(event.id) ?? defaultEditState(event)}
                        projects={projects}
                        categories={categories}
                        onToggleSelect={() => toggleEvent(event.id)}
                        onEditChange={(s) => updateEdit(event.id, s)}
                      />
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && events.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-800 shrink-0">
            <button
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors"
            >
              {importing
                ? <><Loader2 size={12} className="animate-spin" />Importando…</>
                : <>Importar selecionados ({selected.size})</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

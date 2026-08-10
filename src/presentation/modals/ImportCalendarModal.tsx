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
import { Badge, Button, Modal, Toggle } from "@presentation/components/ui";
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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Os dias que a recorrência oferece, na escala do `Date` (0=Dom … 6=Sáb) e
 * **não** no índice do array — a mesma lista dos outros três editores de
 * planejada. O planejamento é só de dias úteis (§5.3), então importar um
 * sábado criaria tarefa sem dia onde aparecer.
 */
const WEEKDAY_VALUES = [1, 2, 3, 4, 5];

function isWeekend(dateISO: string): boolean {
  const dow = new Date(dateISO + "T12:00:00").getDay();
  return dow === 0 || dow === 6;
}

function onlyWeekdays(days: number[]): number[] {
  return days.filter((d) => WEEKDAY_VALUES.includes(d));
}

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
    recurringDays: onlyWeekdays(event.suggestedRecurringDays ?? []),
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

/** Segunda a sexta — a semana do planejamento não tem fim de semana (§5.3). */
function getWeekDays(mondayISO: string): string[] {
  const fmt2 = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: WEEKDAY_VALUES.length }, (_, i) => {
    const d = new Date(mondayISO + "T12:00:00");
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
  });
}

function weekRangeLabel(mondayISO: string): string {
  const monday = new Date(mondayISO + "T12:00:00");
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

function weekRangeLabelLong(mondayISO: string): string {
  const monday = new Date(mondayISO + "T12:00:00");
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  return `${fmt(monday)} a ${fmt(friday)}`;
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
        <span className="text-xs text-fg-muted shrink-0">Agendamento:</span>
        <div className="flex items-center gap-1 bg-raised rounded-control p-0.5">
          <button
            onClick={() => onChange({ ...state, scheduleType: "specific_date" })}
            className={`px-2 py-0.5 text-xs rounded-control transition-colors ${
              state.scheduleType === "specific_date"
                ? "bg-accent text-white"
                : "text-fg-secondary hover:text-fg"
            }`}
          >
            Específica
          </button>
          <button
            onClick={() => {
              const days = state.recurringDays.length
                ? state.recurringDays
                : onlyWeekdays(event.suggestedRecurringDays ?? []);
              onChange({ ...state, scheduleType: "recurring", recurringDays: days });
            }}
            className={`px-2 py-0.5 text-xs rounded-control transition-colors ${
              state.scheduleType === "recurring"
                ? "bg-accent text-white"
                : "text-fg-secondary hover:text-fg"
            }`}
          >
            Recorrente
          </button>
        </div>
      </div>

      {state.scheduleType === "recurring" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-fg-muted shrink-0 mr-1">Dias:</span>
          {WEEKDAY_VALUES.map((day) => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              title={DAY_LABELS[day]}
              className={`w-7 h-7 text-xs rounded-control transition-colors ${
                state.recurringDays.includes(day)
                  ? "bg-accent text-white"
                  : "bg-raised text-fg-muted hover:text-fg"
              }`}
            >
              {DAY_LABELS[day][0]}
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
      className={`border-b border-border-subtle last:border-0 cursor-pointer hover:bg-raised/30 transition-colors ${isDeduped ? "opacity-60" : ""}`}
      onClick={() => onEditChange({ ...editState, expanded: !editState.expanded })}
    >
      <div className="flex items-start gap-2 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 accent-accent shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-fg truncate">{event.title}</span>
            {event.recurringEventId && (
              <span title="Evento recorrente">
                <Repeat2 size={14} className="text-accent-text shrink-0" />
              </span>
            )}
            {isDeduped && (
              <Badge title="Mesma tarefa recorrente já incluída — não criará tarefa separada">
                recorrente
              </Badge>
            )}
            {isDuplicateOfExisting && (
              <Badge
                tone="warning"
                icon={<AlertTriangle size={14} />}
                title="Já existe uma tarefa planejada com este nome"
              >
                já existe
              </Badge>
            )}
          </div>
          <p className="text-xs text-fg-muted mt-0.5">
            {event.allDay
              ? "Dia todo"
              : event.startTime
                ? `${event.startTime}${event.endTime ? ` – ${event.endTime}` : ""}`
                : ""}
            {hasEdits && (
              <span className="ml-2 text-accent-text">
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
        <span className="p-1 text-fg-muted shrink-0">
          {editState.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
      .then(([allEvts, existingTasks]) => {
        // O fim de semana é descartado aqui, na origem, e não só na renderização
        // dos dias: escondido mas presente na lista, o evento de sábado
        // continuava selecionado por padrão, entrava na contagem do botão e era
        // importado — virando planejada sem dia onde aparecer (§5.3).
        const evts = allEvts.filter((e) => !isWeekend(e.date));
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
      <div key={date} className="border-b border-border-subtle last:border-0">
        <div className="flex items-center gap-2 px-4 py-2 bg-raised/40">
          {hasEvents ? (
            <button
              type="button"
              onClick={() => toggleDayEvents(date)}
              className="shrink-0 text-fg-secondary hover:text-fg"
            >
              {allDaySelected ? (
                <CheckSquare size={14} />
              ) : someDaySelected ? (
                <Square size={14} className="opacity-50" />
              ) : (
                <Square size={14} />
              )}
            </button>
          ) : (
            <div className="w-[13px] shrink-0" />
          )}
          <span className="text-xs font-semibold text-fg-secondary capitalize flex-1">
            {dayOfWeek}
            <span className="ml-1.5 font-normal text-fg-muted">{dayShort}</span>
          </span>
          {hasEvents && (
            <span className="text-xs text-fg-muted">
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
          <p className="text-xs text-fg-muted italic px-4 py-2">Nenhum evento neste dia</p>
        )}
      </div>
    );
  }

  const allWeekSelected =
    selectedWeekEvents.length > 0 && selectedWeekEvents.every((e) => selected.has(e.id));

  return (
    // `xl` (900) e não `lg`: é o único modal de duas colunas — a lista de semanas
    // come 192 px, e em 720 sobravam 528 para linhas que editam projeto e
    // categoria em linha. Eram 672 px em `max-w-2xl`, fora das quatro larguras.
    <Modal
      title={
        <>
          <Calendar size={16} className="text-accent-text shrink-0" />
          Importar do Google Calendar
        </>
      }
      size="xl"
      tall
      onClose={onClose}
      // A linha das duas colunas, sem padding: cada coluna rola por si e desenha
      // o próprio espaçamento, e com isso o `overflow` do corpo fica inerte —
      // ele nunca transborda porque a altura dos filhos é a dele.
      bodyClassName="flex"
      toolbar={
        <div className="flex items-center gap-2 text-xs text-fg-secondary">
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
      }
      // A chave decide algo sobre a importação inteira, e fica fora do corpo por
      // isso: dentro, rolaria para fora da vista junto com a lista de eventos.
      notice={
        !loading && !error && events.length > 0 ? (
          <div className="flex items-center gap-2">
            <Toggle
              checked={addOpenUrlAction}
              onChange={setAddOpenUrlAction}
              ariaLabel="Adicionar automaticamente uma ação de abrir URL do evento"
            />
            <span className="text-xs text-fg-secondary">
              Adicionar automaticamente uma ação de abrir URL do evento
            </span>
          </div>
        ) : null
      }
      footer={
        !loading && !error && events.length > 0 ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={importing}
              disabled={effectiveTaskCount === 0}
            >
              {importing
                ? "Importando…"
                : effectiveTaskCount < selected.size
                  ? `Importar ${selected.size} evento(s) → ${effectiveTaskCount} tarefa(s)`
                  : `Importar selecionados (${selected.size})`}
            </Button>
          </>
        ) : null
      }
    >
      {loading || error || events.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-fg-muted">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Buscando eventos…</span>
              </div>
            )}
            {!loading && error && (
              <div className="flex items-start gap-2 m-4 p-3 bg-danger/10 border border-danger rounded-control">
                <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}
            {!loading && !error && (
              <p className="text-sm text-fg-muted text-center py-12">
                Nenhum evento encontrado neste período.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar — lista de semanas */}
            <div className="w-48 shrink-0 border-r border-border-subtle overflow-y-auto bg-surface/50 flex flex-col">
              <div className="px-3 py-2 text-overline uppercase text-fg-muted border-b border-border-subtle">
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
                      isActive ? "bg-raised border-accent" : "border-transparent hover:bg-raised/50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-medium truncate ${isActive ? "text-fg" : "text-fg-secondary"}`}
                      >
                        {weekRangeLabel(weekKey)}
                      </div>
                      <div className="text-xs text-fg-muted mt-0.5">seg a sex</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0 pt-0.5">
                      <Badge tone={isActive ? "accent" : "neutral"}>{count} ev.</Badge>
                      {selCount > 0 && <span className="text-xs text-billable">{selCount} ✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Painel — dias e eventos da semana selecionada */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {selectedWeek ? (
                <>
                  <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-raised/90 backdrop-blur-sm border-b border-border-subtle shrink-0">
                    <span className="text-xs font-semibold text-fg flex-1 capitalize">
                      {weekRangeLabelLong(selectedWeek)}
                    </span>
                    <button
                      onClick={toggleWeekEvents}
                      className="text-xs text-accent-text hover:text-fg transition-colors shrink-0"
                    >
                      {allWeekSelected ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  </div>
                  {selectedWeekDays.map((date) => renderDayGroup(date))}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-fg-muted">
                    <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Selecione uma semana</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </Modal>
  );
}

import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import {
  calendarEventDefaults,
  onlyVisibleDays,
} from "@domain/usecases/calendar/loadCalendarImportCandidates";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { Badge, IconButton } from "@presentation/components/ui";
import { useShowWeekend } from "@presentation/hooks/useShowWeekend";
import { useWeekStart } from "@presentation/hooks/useWeekStart";
import { weekdayOptions } from "@shared/utils/weekdays";
import { AlertTriangle, ChevronDown, ChevronRight, EyeOff, Repeat2 } from "lucide-react";

export const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface EventEditState {
  projectId: string | null;
  projectName: string;
  categoryId: string | null;
  categoryName: string;
  scheduleType: "specific_date" | "recurring";
  recurringDays: number[];
  expanded: boolean;
}

export function defaultEditState(
  event: CalendarEvent,
  projects: Project[],
  categories: Category[],
  showWeekend: boolean
): EventEditState {
  return { ...calendarEventDefaults(event, projects, categories, showWeekend), expanded: false };
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
  const showWeekend = useShowWeekend();
  const weekdays = weekdayOptions(showWeekend, useWeekStart());

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
        <span className="text-sm text-fg-muted shrink-0">Agendamento:</span>
        <div className="flex items-center gap-1 bg-raised rounded-control p-0.5">
          <button
            onClick={() => onChange({ ...state, scheduleType: "specific_date" })}
            className={`px-2 py-0.5 text-sm rounded-control transition-colors ${
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
                : onlyVisibleDays(event.suggestedRecurringDays ?? [], showWeekend);
              onChange({ ...state, scheduleType: "recurring", recurringDays: days });
            }}
            className={`px-2 py-0.5 text-sm rounded-control transition-colors ${
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
          <span className="text-sm text-fg-muted shrink-0 mr-1">Dias:</span>
          {weekdays.map(({ value, label, title }) => (
            <button
              key={value}
              onClick={() => toggleDay(value)}
              title={title}
              className={`w-7 h-7 text-sm rounded-control transition-colors ${
                state.recurringDays.includes(value)
                  ? "bg-accent text-white"
                  : "bg-raised text-fg-muted hover:text-fg"
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
  /** Casa com uma regra de "Eventos ignorados": vem desmarcado e sem o "Ignorar sempre". */
  isIgnored: boolean;
  /**
   * Dias que a planejada terá de fato — os desta linha mais os das ocorrências
   * que ela absorveu. Fica no resumo, e não no editor: ali se edita o dia deste
   * evento, e a linha diz o que será criado.
   */
  effectiveRecurringDays: number[];
  onToggleSelect: () => void;
  onEditChange: (s: EventEditState) => void;
  onIgnore: () => void;
}

export function EventRow({
  event,
  selected,
  editState,
  projects,
  categoryOptionsFor,
  isDeduped,
  isDuplicateOfExisting,
  isIgnored,
  effectiveRecurringDays,
  onToggleSelect,
  onEditChange,
  onIgnore,
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
            {isIgnored && <Badge title="Casa com uma regra de eventos ignorados">Ignorado</Badge>}
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
        {!isIgnored && (
          // O clique na linha abre o editor; o span impede que ignorar também o abra.
          <span onClick={(e) => e.stopPropagation()}>
            <IconButton
              icon={<EyeOff size={14} />}
              title="Ignorar sempre"
              variant="neutral"
              size="sm"
              onClick={onIgnore}
            />
          </span>
        )}
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

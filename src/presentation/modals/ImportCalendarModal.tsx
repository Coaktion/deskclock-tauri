import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { CalendarEvent, ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import {
  importCalendarSelection,
  planCalendarImport,
} from "@domain/usecases/calendar/importCalendarSelection";
import { addIgnoreRule, isEventIgnored } from "@domain/usecases/calendar/isEventIgnored";
import { loadCalendarImportCandidates } from "@domain/usecases/calendar/loadCalendarImportCandidates";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { Badge, Button, DateRangeInput, Modal, Toggle } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useShowWeekend } from "@presentation/hooks/useShowWeekend";
import { useWeekStart } from "@presentation/hooks/useWeekStart";
import { GoogleCalendarLogo } from "@presentation/sections/integrations/google/GoogleCalendarLogo";
import type { WeekStart } from "@shared/types/appConfig";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { todayISO, weekBoundsOf } from "@shared/utils/time";
import { effectiveWeekStart, weekSpan } from "@shared/utils/weekdays";
import { emit } from "@tauri-apps/api/event";
import { AlertCircle, Calendar, CheckSquare, Loader2, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAY_LABELS,
  defaultEditState,
  EventRow,
  type EventEditState,
} from "./ImportCalendarEventRow";

function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const list = map.get(evt.date) ?? [];
    list.push(evt);
    map.set(evt.date, list);
  }
  return map;
}

/**
 * O primeiro dia da semana do evento — a chave dos grupos da barra lateral.
 *
 * Com o fim de semana **desligado** a chave é sempre a segunda, e a escolha
 * `weekStartsOn` não entra: a semana é de segunda a sexta, e abri-la num
 * domingo que a tela não desenha deixaria o primeiro cartão vazio. Ligado, a
 * escolha passa a valer aqui como vale nas pílulas do Planejamento — é a mesma
 * semana, e duas origens diferentes agrupariam os mesmos eventos em cartões
 * diferentes.
 */
function getWeekKeyISO(dateISO: string, showWeekend: boolean, weekStartsOn: WeekStart): string {
  return weekBoundsOf(dateISO, effectiveWeekStart(showWeekend, weekStartsOn)).start;
}

/** Cinco dias a partir da chave, ou a semana inteira com o fim de semana ligado. */
function getWeekDays(weekKeyISO: string, showWeekend: boolean): string[] {
  const fmt2 = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: weekSpan(showWeekend) }, (_, i) => {
    const d = new Date(weekKeyISO + "T12:00:00");
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
  });
}

/** O último dia rotulado, contado da chave da semana. */
function weekEndOf(weekKeyISO: string, showWeekend: boolean): Date {
  const first = new Date(weekKeyISO + "T12:00:00");
  const last = new Date(first);
  last.setDate(first.getDate() + weekSpan(showWeekend) - 1);
  return last;
}

/**
 * "seg a sex", "seg a dom", "dom a sáb" — os extremos da semana que está à
 * vista, lidos dos próprios dias em vez de escritos à mão: com três arranjos
 * possíveis, um literal fica errado em dois deles.
 */
function weekSpanLabel(weekKeyISO: string, showWeekend: boolean): string {
  const first = new Date(weekKeyISO + "T12:00:00").getDay();
  const last = weekEndOf(weekKeyISO, showWeekend).getDay();
  return `${DAY_LABELS[first].toLowerCase()} a ${DAY_LABELS[last].toLowerCase()}`;
}

function weekRangeLabel(weekKeyISO: string, showWeekend: boolean): string {
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(new Date(weekKeyISO + "T12:00:00"))} – ${fmt(weekEndOf(weekKeyISO, showWeekend))}`;
}

function weekRangeLabelLong(weekKeyISO: string, showWeekend: boolean): string {
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  return `${fmt(new Date(weekKeyISO + "T12:00:00"))} a ${fmt(weekEndOf(weekKeyISO, showWeekend))}`;
}

/* ── Modal principal ── */

interface ImportCalendarModalProps {
  importer: ICalendarImporter;
  repo: IPlannedTaskRepository;
  trackedRepo: ITrackedMeetingRepository;
  defaultFromISO: string;
  defaultToISO: string;
  projects: Project[];
  categories: Category[];
  /** `tracked` conta as reuniões que passaram a avisar — ver {@link trackImportedMeetings}. */
  onImported: (count: number, tracked: number) => void;
  onClose: () => void;
}

export function ImportCalendarModal({
  importer,
  repo,
  trackedRepo,
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
  const showWeekend = useShowWeekend();
  const weekStartsOn = useWeekStart();
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
  /** Eventos com o chip "já existe" — planejada de mesmo nome no destino. */
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpenUrlAction, setAddOpenUrlAction] = useState(true);
  // Desligado por padrão: rastrear é assumir que o dia inteiro importado vira
  // aviso na tela, e quem importa uma semana de agenda raramente quer isso.
  const [trackMeetings, setTrackMeetings] = useState(false);
  const [ignoreRules, setIgnoreRules] = useState(() => config.get("calendarIgnoreRules"));

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedWeek(null);
    loadCalendarImportCandidates(importer, repo, {
      fromDay: fromDate,
      toDay: toDate,
      workspaceId,
      showWeekend,
      ignoreRules: config.get("calendarIgnoreRules"),
      projects,
      categories,
    })
      .then((candidates) => {
        const evts = candidates.map((c) => c.event);
        setExistingIds(new Set(candidates.filter((c) => c.alreadyExists).map((c) => c.event.id)));
        setEvents(evts);
        setSelected(new Set(candidates.filter((c) => c.preselected).map((c) => c.event.id)));
        const map = new Map<string, EventEditState>();
        candidates.forEach((c) => map.set(c.event.id, { ...c.defaults, expanded: false }));
        setEditMap(map);
        if (evts.length > 0) {
          const firstDate = [...evts].sort((a, b) => a.date.localeCompare(b.date))[0].date;
          setSelectedWeek(getWeekKeyISO(firstDate, showWeekend, weekStartsOn));
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
    // `showWeekend` está nas dependências, então ligar a config com o modal
    // aberto refaz a busca e zera a seleção. É de propósito: o descarte do fim
    // de semana acontece na origem, e filtrar o resultado já buscado devolveria
    // sábado só depois de uma volta pela rede. Trocar a config com este modal
    // aberto é gesto raro; perder a seleção nele é barato.
  }, [fromDate, toDate, workspaceId, showWeekend]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => groupByDate(events), [events]);

  const allWeekKeys = useMemo(() => {
    const weeks = new Set(events.map((e) => getWeekKeyISO(e.date, showWeekend, weekStartsOn)));
    return [...weeks].sort();
  }, [events, showWeekend, weekStartsOn]);

  /**
   * A semana à vista, e não a que foi clicada.
   *
   * Trocar o primeiro dia da semana nas Configurações move a origem de todos os
   * grupos, e a chave guardada no clique deixa de existir: sem este ajuste a
   * barra lateral mostraria as semanas novas com nenhuma selecionada, e o painel
   * ao lado ficaria vazio sem explicar por quê.
   */
  const activeWeek =
    selectedWeek && allWeekKeys.includes(selectedWeek) ? selectedWeek : (allWeekKeys[0] ?? null);

  const selectedWeekDays = useMemo(() => {
    if (!activeWeek) return [];
    return getWeekDays(activeWeek, showWeekend).filter((d) => d >= fromDate && d <= toDate);
  }, [activeWeek, fromDate, toDate, showWeekend]);

  const selectedWeekEvents = useMemo(() => {
    if (!activeWeek) return [];
    return events.filter((e) => getWeekKeyISO(e.date, showWeekend, weekStartsOn) === activeWeek);
  }, [events, activeWeek, showWeekend, weekStartsOn]);

  // Nome + horário, não o id da série do Google — ver `dedupeCalendarEvents`.
  const importPlan = useMemo(
    () =>
      planCalendarImport(
        events
          .filter((e) => selected.has(e.id))
          .map((e) => {
            const edit = editMap.get(e.id);
            return {
              event: e,
              projectId: edit?.projectId ?? null,
              categoryId: edit?.categoryId ?? null,
              scheduleType: edit?.scheduleType ?? "specific_date",
              recurringDays: edit?.recurringDays ?? [],
            };
          })
      ),
    [events, selected, editMap]
  );
  const { dedupedIds: dedupedEventIds, daysById: mergedDaysById } = importPlan;

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
    const { inputs } = importPlan;
    if (inputs.length === 0) return;

    setImporting(true);
    try {
      const { created, tracked, trackErrors } = await importCalendarSelection(
        { plannedRepo: repo, trackedRepo },
        inputs,
        {
          workspaceId,
          nowISO: new Date().toISOString(),
          todayISO: todayISO(),
          addOpenUrlAction,
          trackMeetings,
        }
      );
      if (created.length > 0) void emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      // As planejadas já estão gravadas: a falha do rastreio fica no console, e
      // pintar "erro ao importar" levaria o usuário a repetir e duplicar tudo.
      if (trackErrors.length > 0) {
        console.error("[importCalendar] falha ao rastrear reuniões", trackErrors);
      }
      onImported(created.length, tracked);
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
          <span className="text-sm font-semibold text-fg-secondary capitalize flex-1">
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
              editState={
                editMap.get(event.id) ?? defaultEditState(event, projects, categories, showWeekend)
              }
              projects={projects}
              categoryOptionsFor={categoryOptionsFor}
              isDeduped={dedupedEventIds.has(event.id)}
              isDuplicateOfExisting={existingIds.has(event.id)}
              isIgnored={isEventIgnored(event.title, ignoreRules)}
              effectiveRecurringDays={
                mergedDaysById.get(event.id) ??
                editMap.get(event.id)?.recurringDays ??
                event.suggestedRecurringDays ??
                []
              }
              onToggleSelect={() => toggleEvent(event.id)}
              onEditChange={(s) => updateEdit(event.id, s)}
              onIgnore={() => void ignoreEvent(event.title)}
            />
          ))
        ) : (
          <p className="text-xs text-fg-muted italic px-4 py-2">Nenhum evento neste dia</p>
        )}
      </div>
    );
  }

  // A regra casa pelo nome, então desmarca junto toda ocorrência de mesmo título.
  async function ignoreEvent(title: string) {
    const next = addIgnoreRule(ignoreRules, { operator: "equals", value: title });
    setSelected((prev) => {
      const s = new Set(prev);
      events.forEach((e) => {
        if (isEventIgnored(e.title, next)) s.delete(e.id);
      });
      return s;
    });
    if (next === ignoreRules) return;
    setIgnoreRules(next);
    await config.set("calendarIgnoreRules", next);
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
          <span className="shrink-0 flex">
            <GoogleCalendarLogo size={16} />
          </span>
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
        // O clamp mútuo que morava nos dois `onChange` saiu daqui: o campo de
        // período resolve a ordem das pontas por dentro, trocando-as quando o
        // fim é escolhido antes do início.
        <div className="flex items-center gap-2 text-sm text-fg-secondary">
          <span className="shrink-0">Período</span>
          <DateRangeInput
            startDate={fromDate}
            endDate={toDate}
            onChange={(inicio, fim) => {
              setFromDate(inicio);
              setToDate(fim);
            }}
            presets={["thisWeek", "nextWeek", "lastWeek", "thisMonth"]}
            className="flex-1"
          />
        </div>
      }
      // As chaves decidem algo sobre a importação inteira, e ficam fora do corpo
      // por isso: dentro, rolariam para fora da vista junto com a lista de eventos.
      notice={
        !loading && !error && events.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Toggle
                checked={addOpenUrlAction}
                onChange={setAddOpenUrlAction}
                ariaLabel="Adicionar automaticamente uma ação de abrir URL do evento"
              />
              <span className="text-sm text-fg-secondary">
                Adicionar automaticamente uma ação de abrir URL do evento
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Toggle
                checked={trackMeetings}
                onChange={setTrackMeetings}
                ariaLabel="Rastrear reuniões (avisar no início e no fim)"
              />
              <span className="text-sm text-fg-secondary">
                Rastrear reuniões (avisar no início e no fim)
              </span>
            </div>
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
              const count = events.filter(
                (e) => getWeekKeyISO(e.date, showWeekend, weekStartsOn) === weekKey
              ).length;
              const selCount = events.filter(
                (e) =>
                  getWeekKeyISO(e.date, showWeekend, weekStartsOn) === weekKey && selected.has(e.id)
              ).length;
              const isActive = activeWeek === weekKey;
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
                      className={`text-sm font-medium truncate ${isActive ? "text-fg" : "text-fg-secondary"}`}
                    >
                      {weekRangeLabel(weekKey, showWeekend)}
                    </div>
                    <div className="text-xs text-fg-muted mt-0.5">
                      {weekSpanLabel(weekKey, showWeekend)}
                    </div>
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
            {activeWeek ? (
              <>
                <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-raised/90 backdrop-blur-sm border-b border-border-subtle shrink-0">
                  <span className="text-sm font-semibold text-fg flex-1 capitalize">
                    {weekRangeLabelLong(activeWeek, showWeekend)}
                  </span>
                  <button
                    onClick={toggleWeekEvents}
                    className="text-sm text-accent-text hover:text-fg transition-colors shrink-0"
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

import { useEffect, useMemo, useState } from "react";
import { X, RefreshCw, Loader2 } from "lucide-react";
import { ClockifyClient } from "@infra/integrations/clockify/ClockifyClient";
import type { ClockifyTimeEntryFull } from "@infra/integrations/clockify/types";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import {
  todayISO,
  addDaysISO,
  startOfDayISO,
  endOfDayISO,
  startOfMonthISO,
  formatHistoryDayHeader,
  formatHHMM,
  formatDurationCompact,
} from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";

type QuickFilter = "today" | "7days" | "30days" | "month" | "custom";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
  custom: "Personalizado",
};

interface ClockifyEntriesModalProps {
  onClose: () => void;
}

function projectDisplayName(p: { name: string; clientName?: string | null }): string {
  return p.clientName ? `${p.clientName} - ${p.name}` : p.name;
}

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTimeLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function entryDurationSeconds(entry: ClockifyTimeEntryFull): number {
  if (!entry.timeInterval.end) return 0;
  return Math.round(
    (new Date(entry.timeInterval.end).getTime() - new Date(entry.timeInterval.start).getTime()) / 1000
  );
}

interface DayGroup {
  dateISO: string;
  entries: ClockifyTimeEntryFull[];
  totalSeconds: number;
}

function groupByDay(entries: ClockifyTimeEntryFull[]): DayGroup[] {
  const map = new Map<string, ClockifyTimeEntryFull[]>();
  for (const e of entries) {
    const date = toLocalDate(e.timeInterval.start);
    const list = map.get(date) ?? [];
    list.push(e);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateISO, list]) => ({
      dateISO,
      entries: list.sort(
        (a, b) => new Date(b.timeInterval.start).getTime() - new Date(a.timeInterval.start).getTime()
      ),
      totalSeconds: list.reduce((s, e) => s + entryDurationSeconds(e), 0),
    }));
}

export function ClockifyEntriesModal({ onClose }: ClockifyEntriesModalProps) {
  const config = useAppConfig();
  const apiKey = config.get("clockifyApiKey");
  const userId = config.get("clockifyUserId");
  const workspaceId = config.get("clockifyActiveWorkspaceId");
  const workspaceName = config.get("clockifyActiveWorkspaceName");
  const defaultTagIds = config.get("clockifyDefaultTagIds");

  const [quick, setQuick] = useState<QuickFilter>("today");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [entries, setEntries] = useState<ClockifyTimeEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [onlyDefaultTags, setOnlyDefaultTags] = useState(defaultTagIds.length > 0);

  // ESC fecha
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Range derivado do filtro
  const range = useMemo(() => {
    const today = todayISO();
    switch (quick) {
      case "today":  return { start: today, end: today };
      case "7days":  return { start: addDaysISO(today, -6), end: today };
      case "30days": return { start: addDaysISO(today, -29), end: today };
      case "month":  return { start: startOfMonthISO(), end: today };
      case "custom": return { start: customStart, end: customEnd };
    }
  }, [quick, customStart, customEnd]);

  const rangeValid = !!range.start && !!range.end && range.start <= range.end;

  // Fetch de entries quando o range muda
  useEffect(() => {
    if (!apiKey || !workspaceId || !userId || !rangeValid) return;
    const client = new ClockifyClient(apiKey);
    setLoading(true);
    client
      .listTimeEntries(workspaceId, userId, startOfDayISO(range.start), endOfDayISO(range.end))
      .then(setEntries)
      .catch((err) => {
        showToast("error", err instanceof Error ? err.message : "Erro ao carregar apontamentos.");
      })
      .finally(() => setLoading(false));
  }, [apiKey, workspaceId, userId, range.start, range.end, rangeValid, refreshSignal]);

  // Pipeline de filtragem: oculta in-progress e (opcional) filtra por tags padrão
  const visibleEntries = useMemo(() => {
    let list = entries.filter((e) => e.timeInterval.end !== null);
    if (onlyDefaultTags && defaultTagIds.length > 0) {
      list = list.filter((e) => defaultTagIds.every((id) => e.tagIds.includes(id)));
    }
    return list;
  }, [entries, onlyDefaultTags, defaultTagIds]);

  const dayGroups = useMemo(() => groupByDay(visibleEntries), [visibleEntries]);

  const filteredOutByTags =
    onlyDefaultTags &&
    defaultTagIds.length > 0 &&
    visibleEntries.length === 0 &&
    entries.some((e) => e.timeInterval.end !== null);

  const showLoading = loading && entries.length === 0;
  const showEmpty = !loading && dayGroups.length === 0 && !filteredOutByTags;

  // Guard: configuração ausente
  if (!apiKey || !workspaceId || !userId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
          <p className="text-sm text-gray-200 mb-4">
            Configure o Clockify (API Key + workspace) na tela de Integrações antes de abrir esta janela.
          </p>
          <button
            onClick={onClose}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">Apontamentos do Clockify</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {workspaceName ? `Workspace: ${workspaceName}` : "Workspace ativo"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setRefreshSignal((n) => n + 1)}
              disabled={loading}
              title="Recarregar"
              className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              title="Fechar"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(QUICK_LABELS) as QuickFilter[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuick(q)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  quick === q
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {QUICK_LABELS[q]}
              </button>
            ))}
          </div>

          {quick === "custom" && (
            <div className="flex items-center gap-2">
              <DatePickerInput
                value={customStart}
                onChange={setCustomStart}
                className="text-xs"
              />
              <span className="text-xs text-gray-600">até</span>
              <DatePickerInput
                value={customEnd}
                onChange={setCustomEnd}
                className="text-xs"
              />
            </div>
          )}

          {defaultTagIds.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={onlyDefaultTags}
                onChange={(e) => setOnlyDefaultTags(e.target.checked)}
                className="accent-blue-500"
              />
              Apenas com tags padrão
            </label>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {!rangeValid && (
            <p className="text-center text-gray-500 text-sm py-12">
              Selecione um período válido.
            </p>
          )}

          {rangeValid && showLoading && (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {rangeValid && showEmpty && (
            <p className="text-center text-gray-500 text-sm py-12">
              Nenhum apontamento encontrado neste período.
            </p>
          )}

          {rangeValid && filteredOutByTags && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 mb-2">
                Nenhum apontamento com as tags padrão neste período.
              </p>
              <button
                onClick={() => setOnlyDefaultTags(false)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Mostrar todos
              </button>
            </div>
          )}

          {rangeValid && dayGroups.length > 0 && (
            <div>
              {dayGroups.map((group) => (
                <div key={group.dateISO}>
                  <div className="flex items-center justify-between px-5 py-2.5 bg-gray-900/60 border-b border-gray-800 sticky top-0 z-10">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                      {formatHistoryDayHeader(group.dateISO)}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-gray-500">
                      {formatHHMM(group.totalSeconds)}
                    </span>
                  </div>
                  {group.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: ClockifyTimeEntryFull }) {
  const startStr = formatTimeLocal(entry.timeInterval.start);
  const endStr = entry.timeInterval.end ? formatTimeLocal(entry.timeInterval.end) : "—";
  const duration = entryDurationSeconds(entry);
  const projectLabel = entry.project ? projectDisplayName(entry.project) : null;
  const projectColor = entry.project?.color ?? "#6b7280";

  return (
    <div className="grid grid-cols-[110px_1fr_auto] items-center gap-3 px-5 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            entry.billable ? "bg-emerald-500" : "bg-gray-600"
          }`}
        />
        <span className="text-xs font-mono text-gray-400 tabular-nums">
          {startStr}–{endStr}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-gray-100 truncate">
          {entry.description?.trim() ? (
            entry.description
          ) : (
            <span className="italic text-gray-500">(sem descrição)</span>
          )}
        </p>
        {(projectLabel || (entry.tags && entry.tags.length > 0)) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {projectLabel && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: projectColor }}
                />
                {projectLabel}
              </span>
            )}
            {entry.tags?.map((t) => (
              <span
                key={t.id}
                className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-[10px]"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <span className="text-sm font-mono tabular-nums text-gray-300 shrink-0">
        {formatDurationCompact(duration)}
      </span>
    </div>
  );
}

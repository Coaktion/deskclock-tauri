import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Send,
  Loader2,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@shared/utils/groupTasks";
import { groupTasks } from "@shared/utils/groupTasks";
import { TaskRepository } from "@infra/database/TaskRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import {
  sendTasks,
  NoIntegrationError,
  NoTasksSelectedError,
} from "@domain/usecases/tasks/SendTasks";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  todayISO,
  addDaysISO,
  startOfDayISO,
  endOfDayISO,
  startOfMonthISO,
  formatDurationCompact,
} from "@shared/utils/time";
import { NULLABLE_FIELDS, type TaskField } from "@shared/types/sheetsConfig";
import { getProjectColor } from "@shared/utils/projectColor";
import { validateTaskForSheets, formatMissingFields } from "@domain/integrations/taskValidation";

const taskRepo = new TaskRepository();
const logRepo = new TaskIntegrationLogRepository();

const INTEGRATION = "google_sheets";

type QuickPeriod = "today" | "yesterday" | "week" | "month" | "custom";

interface PeriodRange {
  start: string;
  end: string;
}

interface DayGroup {
  date: string;
  groups: TaskGroup[];
}

function toLocalDate(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
  const datePart = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${weekday}, ${datePart}`;
}

function groupTasksByDay(tasks: Task[]): DayGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    const date = toLocalDate(task.startTime);
    const list = byDate.get(date) ?? [];
    list.push(task);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayTasks]) => ({ date, groups: groupTasks(dayTasks) }));
}

function selKey(date: string, groupKey: string): string {
  return `${date}\0${groupKey}`;
}

function quickToRange(quick: QuickPeriod, customStart: string, customEnd: string): PeriodRange {
  const today = todayISO();
  switch (quick) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = addDaysISO(today, -1);
      return { start: y, end: y };
    }
    case "week":
      return { start: addDaysISO(today, -6), end: today };
    case "month":
      return { start: startOfMonthISO(), end: today };
    case "custom":
      return { start: customStart, end: customEnd };
  }
}

function validateTasks(tasks: Task[], enabledFields: TaskField[]): string | null {
  const requiredNullable = NULLABLE_FIELDS.filter((f) => enabledFields.includes(f));
  if (requiredNullable.length === 0) return null;

  const fieldLabel: Record<TaskField, string> = {
    date: "data",
    name: "nome",
    project: "projeto",
    category: "categoria",
    billable: "billable",
    startTime: "início",
    endTime: "fim",
    duration: "duração",
  };

  const incomplete: string[] = [];
  for (const task of tasks) {
    const missing: string[] = [];
    if (requiredNullable.includes("name") && !task.name?.trim()) missing.push(fieldLabel.name);
    if (requiredNullable.includes("project") && !task.projectId) missing.push(fieldLabel.project);
    if (requiredNullable.includes("category") && !task.categoryId)
      missing.push(fieldLabel.category);
    if (missing.length > 0) {
      incomplete.push(`"${task.name ?? "(sem nome)"}" — faltam: ${missing.join(", ")}`);
    }
  }

  return incomplete.length === 0 ? null : `Dados incompletos:\n${incomplete.join("\n")}`;
}

/* ── Row de grupo ── */

interface GroupRowProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  sentIds: Set<string>;
  selected: boolean;
  onToggle: () => void;
}

function GroupRow({ group, projects, categories, sentIds, selected, onToggle }: GroupRowProps) {
  const first = group.tasks[0];
  const project = projects.find((p) => p.id === first.projectId);
  const category = categories.find((c) => c.id === first.categoryId);
  const allSent = group.tasks.every((t) => sentIds.has(t.id));
  const someSent = !allSent && group.tasks.some((t) => sentIds.has(t.id));
  const projectColor = getProjectColor(first.projectId);
  const validation = validateTaskForSheets(first);
  const isInvalid = !validation.ok;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isInvalid ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-800/50 cursor-pointer"
      }`}
      onClick={isInvalid ? undefined : onToggle}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={isInvalid ? undefined : onToggle}
        onClick={(e) => e.stopPropagation()}
        disabled={isInvalid}
        className="flex-shrink-0 accent-blue-500 cursor-pointer disabled:cursor-not-allowed"
      />

      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: projectColor }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-100 truncate">{first.name ?? "(sem nome)"}</span>
          {isInvalid && (
            <span className="flex items-center gap-0.5 text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full shrink-0">
              <AlertTriangle size={10} />
              Faltando: {formatMissingFields(validation.missing)}
            </span>
          )}
          {!isInvalid && allSent && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full shrink-0">
              <CheckCheck size={10} />
              Enviado
            </span>
          )}
          {!isInvalid && someSent && (
            <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded-full shrink-0">
              <AlertTriangle size={10} />
              Parcial
            </span>
          )}
        </div>
        <div className="flex gap-2 text-[11px] text-gray-500 mt-0.5">
          {project && <span>{project.name}</span>}
          {category && <span>{category.name}</span>}
          {group.tasks.length > 1 && (
            <span className="text-gray-600">{group.tasks.length} registros</span>
          )}
        </div>
      </div>

      <span className="text-xs font-mono tabular-nums text-gray-400 shrink-0">
        {formatDurationCompact(group.totalSeconds)}
      </span>
    </div>
  );
}

/* ── Modal principal ── */

interface SheetsSendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function SheetsSendModal({ projects, categories, onClose }: SheetsSendModalProps) {
  const config = useAppConfig();

  const [quick, setQuick] = useState<QuickPeriod>("today");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const sender = useMemo(() => {
    if (!config.isLoaded) return null;
    const spreadsheetId = config.get("integrationGoogleSheetsSpreadsheetId");
    const refreshToken = config.get("googleRefreshToken");
    if (!spreadsheetId || !refreshToken) return null;
    return new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.isLoaded, projects, categories]);

  const customStartRef = useRef(customStart);
  const customEndRef = useRef(customEnd);
  useEffect(() => {
    customStartRef.current = customStart;
  }, [customStart]);
  useEffect(() => {
    customEndRef.current = customEnd;
  }, [customEnd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);

    async function run() {
      try {
        const { start, end } = quickToRange(quick, customStartRef.current, customEndRef.current);
        const [tasks, sentIdsArr] = await Promise.all([
          taskRepo.findByDateRange(startOfDayISO(start), endOfDayISO(end)),
          logRepo.findSentIds(INTEGRATION, startOfDayISO(start), endOfDayISO(end)),
        ]);

        if (cancelled) return;

        const completed = tasks.filter((t) => t.status === "completed");
        const newSentIds = new Set(sentIdsArr);
        const dg = groupTasksByDay(completed);

        const keys = new Set<string>();
        for (const { date, groups } of dg) {
          for (const g of groups) {
            const valid = validateTaskForSheets(g.tasks[0]).ok;
            if (valid && !g.tasks.every((t) => newSentIds.has(t.id))) {
              keys.add(selKey(date, g.key));
            }
          }
        }

        setDayGroups(dg);
        setSentIds(newSentIds);
        setSelectedKeys(keys);
        setCollapsedDays(new Set());
        setLoaded(true);
      } catch (err) {
        console.error("[SheetsSendModal] loadTasks error:", err);
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : JSON.stringify(err);
          setMessage({ text: msg || "Erro ao carregar tarefas.", error: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [quick, reloadKey]);

  function toggleGroup(date: string, key: string, group: TaskGroup) {
    if (!validateTaskForSheets(group.tasks[0]).ok) return;
    const sk = selKey(date, key);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sk)) next.delete(sk);
      else next.add(sk);
      return next;
    });
  }

  function toggleDay(date: string, groups: TaskGroup[]) {
    const validGroups = groups.filter((g) => validateTaskForSheets(g.tasks[0]).ok);
    const dayKeys = validGroups.map((g) => selKey(date, g.key));
    const allSelected = dayKeys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) dayKeys.forEach((k) => next.delete(k));
      else dayKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function toggleDayCollapse(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function selectAll() {
    const keys = new Set<string>();
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (validateTaskForSheets(g.tasks[0]).ok) keys.add(selKey(date, g.key));
      }
    }
    setSelectedKeys(keys);
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  const hasSentSelected = useMemo(() => {
    if (selectedKeys.size === 0) return false;
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (selectedKeys.has(selKey(date, g.key)) && g.tasks.every((t) => sentIds.has(t.id))) {
          return true;
        }
      }
    }
    return false;
  }, [selectedKeys, dayGroups, sentIds]);

  async function handleSend() {
    if (selectedKeys.size === 0) return;
    setMessage(null);

    const selectedGroups: TaskGroup[] = [];
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (selectedKeys.has(selKey(date, g.key))) selectedGroups.push(g);
      }
    }

    const tasksToSend = selectedGroups.map((g) => ({
      ...g.tasks[0],
      durationSeconds: g.totalSeconds,
    }));
    const allTaskIds = selectedGroups.flatMap((g) => g.tasks.map((t) => t.id));

    const mapping = config.get("integrationGoogleSheetsColumnMapping");
    const enabledFields = mapping.filter((c) => c.enabled).map((c) => c.field);
    const validationError = validateTasks(tasksToSend, enabledFields);
    if (validationError) {
      setMessage({ text: validationError, error: true });
      return;
    }

    setSending(true);
    try {
      await sendTasks(sender, tasksToSend);
      await logRepo.markSent(allTaskIds, INTEGRATION);
      await config.set("sheetsDailySyncLastTimestamp", new Date().toISOString());
      setMessage({
        text: `${selectedGroups.length} grupo(s) enviado(s) com sucesso.`,
        error: false,
      });
      setSelectedKeys(new Set());
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof NoIntegrationError) {
        setMessage({ text: "Integração com Google Sheets não configurada.", error: true });
      } else if (err instanceof NoTasksSelectedError) {
        setMessage({ text: "Selecione ao menos uma tarefa.", error: true });
      } else {
        setMessage({ text: err instanceof Error ? err.message : "Erro ao enviar.", error: true });
      }
    } finally {
      setSending(false);
    }
  }

  const QUICK_LABELS: Record<QuickPeriod, string> = {
    today: "Hoje",
    yesterday: "Ontem",
    week: "7 dias",
    month: "Mês",
    custom: "Período",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Enviar para Google Sheets</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Selecione o período e as tarefas a enviar
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Período */}
        <div className="px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(QUICK_LABELS) as QuickPeriod[]).map((q) => (
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
            <div className="flex items-center gap-2 mt-2.5">
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <span className="text-xs text-gray-600">até</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={todayISO()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                disabled={loading}
                className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded transition-colors"
              >
                {loading ? <Loader2 size={11} className="animate-spin" /> : "Carregar"}
              </button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && !loaded ? (
            <div className="flex items-center justify-center py-10 text-gray-600">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : dayGroups.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-10">
              Nenhuma tarefa concluída no período.
            </p>
          ) : (
            <div className="space-y-1">
              {dayGroups.map(({ date, groups }) => {
                const dayKeys = groups.map((g) => selKey(date, g.key));
                const selectedCount = dayKeys.filter((k) => selectedKeys.has(k)).length;
                const allSelected = selectedCount === groups.length;
                const someSelected = selectedCount > 0 && !allSelected;
                const isCollapsed = collapsedDays.has(date);
                const dayTotal = groups.reduce((s, g) => s + g.totalSeconds, 0);

                return (
                  <div key={date} className="rounded-lg overflow-hidden">
                    {/* Day header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 cursor-pointer hover:bg-gray-800 transition-colors select-none"
                      onClick={() => toggleDayCollapse(date)}
                    >
                      <div
                        className={`w-4 h-4 border rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                          allSelected
                            ? "bg-blue-600 border-blue-600"
                            : someSelected
                              ? "bg-blue-600/30 border-blue-500/50"
                              : "border-gray-600 bg-transparent"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDay(date, groups);
                        }}
                      >
                        {allSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        {someSelected && <div className="w-2 h-0.5 bg-blue-400 rounded-sm" />}
                      </div>

                      <span className="flex-1 text-xs font-medium text-gray-300 capitalize">
                        {formatDayLabel(date)}
                      </span>

                      <span className="text-[11px] text-gray-500">
                        {selectedCount}/{groups.length}
                      </span>

                      <span className="text-xs font-mono tabular-nums text-gray-500 mr-1">
                        {formatDurationCompact(dayTotal)}
                      </span>

                      {isCollapsed ? (
                        <ChevronRight size={14} className="text-gray-600 shrink-0" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-600 shrink-0" />
                      )}
                    </div>

                    {/* Group rows */}
                    {!isCollapsed && (
                      <div className="pl-2 space-y-0.5 py-1">
                        {groups.map((g) => (
                          <GroupRow
                            key={g.key}
                            group={g}
                            projects={projects}
                            categories={categories}
                            sentIds={sentIds}
                            selected={selectedKeys.has(selKey(date, g.key))}
                            onToggle={() => toggleGroup(date, g.key, g)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Aviso re-envio */}
        {hasSentSelected && (
          <div className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              Uma ou mais tarefas selecionadas já foram enviadas. O reenvio pode criar duplicatas na
              planilha.
            </p>
          </div>
        )}

        {/* Mensagem de resultado */}
        {message && (
          <p
            className={`mx-5 mb-2 text-xs whitespace-pre-line ${message.error ? "text-red-400" : "text-green-400"}`}
          >
            {message.text}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-800">
          <button
            onClick={selectAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <CheckSquare size={12} />
            Todas
          </button>
          <button
            onClick={deselectAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Square size={12} />
            Nenhuma
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || selectedKeys.size === 0}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {sending ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send size={12} />
                Enviar ({selectedKeys.size})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

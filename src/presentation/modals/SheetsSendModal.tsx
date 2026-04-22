import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Send,
  Loader2,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCheck,
} from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@shared/utils/groupTasks";
import { groupTasks } from "@shared/utils/groupTasks";
import { TaskRepository } from "@infra/database/TaskRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { sendTasks, NoIntegrationError, NoTasksSelectedError } from "@domain/usecases/tasks/SendTasks";
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

const taskRepo = new TaskRepository();
const logRepo = new TaskIntegrationLogRepository();

const INTEGRATION = "google_sheets";

type QuickPeriod = "today" | "yesterday" | "week" | "month" | "custom";

interface PeriodRange {
  start: string;
  end: string;
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
    date: "data", name: "nome", project: "projeto", category: "categoria",
    billable: "billable", startTime: "início", endTime: "fim", duration: "duração",
  };

  const incomplete: string[] = [];
  for (const task of tasks) {
    const missing: string[] = [];
    if (requiredNullable.includes("name") && !task.name?.trim()) missing.push(fieldLabel.name);
    if (requiredNullable.includes("project") && !task.projectId) missing.push(fieldLabel.project);
    if (requiredNullable.includes("category") && !task.categoryId) missing.push(fieldLabel.category);
    if (missing.length > 0) {
      incomplete.push(`"${task.name ?? "(sem nome)"}" — faltam: ${missing.join(", ")}`);
    }
  }

  return incomplete.length === 0 ? null : `Dados incompletos:\n${incomplete.join("\n")}`;
}

/* ── Row de grupo no modal ── */

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

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 accent-blue-500 cursor-pointer"
      />

      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: projectColor }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-100 truncate">{first.name ?? "(sem nome)"}</span>
          {allSent && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full shrink-0">
              <CheckCheck size={10} />
              Enviado
            </span>
          )}
          {someSent && (
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
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Incrementado após envio para forçar reload da lista
  const [reloadKey, setReloadKey] = useState(0);

  const sender = useMemo(() => {
    if (!config.isLoaded) return null;
    const spreadsheetId = config.get("integrationGoogleSheetsSpreadsheetId");
    const refreshToken = config.get("googleRefreshToken");
    if (!spreadsheetId || !refreshToken) return null;
    return new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.isLoaded, projects, categories]);

  // customStart/customEnd via ref para o effect acessar o valor atual sem precisar
  // de deps que causariam reloads a cada keystroke.
  const customStartRef = useRef(customStart);
  const customEndRef = useRef(customEnd);
  useEffect(() => { customStartRef.current = customStart; }, [customStart]);
  useEffect(() => { customEndRef.current = customEnd; }, [customEnd]);

  // Carrega tarefas sempre que o período ou reloadKey mudam.
  // Lógica inline no effect garante que `quick` nunca fica stale — sem useCallback.
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
        const grps = groupTasks(completed);
        const sorted = [...grps].sort((a, b) => {
          const aSent = a.tasks.every((t) => newSentIds.has(t.id)) ? 1 : 0;
          const bSent = b.tasks.every((t) => newSentIds.has(t.id)) ? 1 : 0;
          return aSent - bSent;
        });

        setGroups(sorted);
        setSentIds(newSentIds);
        setSelectedKeys(new Set(sorted.filter((g) => !g.tasks.every((t) => newSentIds.has(t.id))).map((g) => g.key)));
        setLoaded(true);
      } catch (err) {
        console.error("[SheetsSendModal] loadTasks error:", err);
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
          setMessage({ text: msg || "Erro ao carregar tarefas.", error: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [quick, reloadKey]);

  function toggleGroup(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(groups.map((g) => g.key)));
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  const hasSentSelected = selectedKeys.size > 0 &&
    [...selectedKeys].some((k) => {
      const g = groups.find((g) => g.key === k);
      return g?.tasks.every((t) => sentIds.has(t.id));
    });

  async function handleSend() {
    if (selectedKeys.size === 0) return;
    setMessage(null);

    const selectedGroups = groups.filter((g) => selectedKeys.has(g.key));
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
      setMessage({ text: `${selectedGroups.length} grupo(s) enviado(s) com sucesso.`, error: false });
      setSelectedKeys(new Set());
      // Reload para atualizar badges de "enviado"
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
            <p className="text-xs text-gray-500 mt-0.5">Selecione o período e as tarefas a enviar</p>
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
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-10">
              Nenhuma tarefa concluída no período.
            </p>
          ) : (
            <div className="space-y-0.5">
              {groups.map((g) => (
                <GroupRow
                  key={g.key}
                  group={g}
                  projects={projects}
                  categories={categories}
                  sentIds={sentIds}
                  selected={selectedKeys.has(g.key)}
                  onToggle={() => toggleGroup(g.key)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Aviso re-envio */}
        {hasSentSelected && (
          <div className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              Uma ou mais tarefas selecionadas já foram enviadas. O reenvio pode criar duplicatas na planilha.
            </p>
          </div>
        )}

        {/* Mensagem de resultado */}
        {message && (
          <p className={`mx-5 mb-2 text-xs whitespace-pre-line ${message.error ? "text-red-400" : "text-green-400"}`}>
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

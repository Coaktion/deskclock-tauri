import { useState } from "react";
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
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { TaskValidationResult } from "@domain/integrations/taskValidation";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import {
  sendTasks,
  NoIntegrationError,
  NoTasksSelectedError,
} from "@domain/usecases/tasks/SendTasks";
import { formatDurationCompact, todayISO } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import {
  useTaskSendSelection,
  formatDayLabel,
  selKey,
  type QuickPeriod,
} from "@presentation/hooks/useTaskSendSelection";

export interface TaskSendAdapter {
  /** Id da integração — usado em taskLogRepo.findSentIds / markSent. */
  integrationId: string;
  /**
   * Workspace do DeskClock da integração — o recorte da lista de tarefas.
   * Cada adaptador resolve o seu (`resolveIntegrationWorkspaceId`).
   */
  workspaceId: string;
  /** Título exibido no header do modal. */
  title: string;
  /** Sender pronto para uso (null quando integração não configurada). */
  sender: ITaskSender | null;
  /** Valida uma tarefa antes de exibi-la / selecioná-la. */
  validateTask: (task: Task) => TaskValidationResult;
  /** Validação adicional imediatamente antes de enviar (ex: campos obrigatórios do Sheets). */
  validateBeforeSend?: (tasks: Task[]) => string | null;
  /** Chamado após sendTasks+markSent com sucesso (ex: atualizar timestamp do último sync). */
  onSendSuccess: (taskIds: string[]) => Promise<void>;
  /** Mensagem de erro quando sender é null. */
  notConfiguredMessage: string;
  /**
   * Envia as tarefas cruas em vez de um registro unificado por grupo. Para
   * integrações idempotentes, que precisam de todos os ids do grupo para
   * reencontrar o registro já criado no destino.
   */
  sendsRawTasks?: boolean;
  /** Sobrescreve o aviso exibido quando há tarefas já enviadas na seleção. */
  resendWarning?: string;
}

const DEFAULT_RESEND_WARNING =
  "Uma ou mais tarefas selecionadas já foram enviadas. O reenvio pode criar duplicatas.";

interface GroupRowProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  sentIds: Set<string>;
  selected: boolean;
  onToggle: () => void;
  validateTask: (task: Task) => TaskValidationResult;
}

function GroupRow({
  group,
  projects,
  categories,
  sentIds,
  selected,
  onToggle,
  validateTask,
}: GroupRowProps) {
  const first = group.tasks[0];
  const project = projects.find((p) => p.id === first.projectId);
  const category = categories.find((c) => c.id === first.categoryId);
  const allSent = group.tasks.every((t) => sentIds.has(t.id));
  const someSent = !allSent && group.tasks.some((t) => sentIds.has(t.id));
  const projectColor = getProjectColor(first.projectId);
  const validation = validateTask(first);
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
        checked={selected && !isInvalid}
        disabled={isInvalid}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
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
              Faltando: {validation.missing.join(", ")}
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

interface TaskSendModalProps {
  adapter: TaskSendAdapter;
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

const QUICK_LABELS: Record<QuickPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "7 dias",
  month: "Mês",
  custom: "Período",
};

export function TaskSendModal({ adapter, projects, categories, onClose }: TaskSendModalProps) {
  const { taskLogRepo } = useRepositories();
  const sel = useTaskSendSelection(
    adapter.integrationId,
    adapter.validateTask,
    adapter.workspaceId
  );

  const [sending, setSending] = useState(false);

  useEscapeToClose(onClose);

  async function handleSend() {
    if (sel.selectedKeys.size === 0) return;
    sel.setMessage(null);

    const selectedGroups = sel.collectSelectedGroups();
    const tasksToSend = adapter.sendsRawTasks
      ? selectedGroups.flatMap((g) => g.tasks)
      : selectedGroups.map((g) => ({
          ...g.tasks[0],
          durationSeconds: g.totalSeconds,
        }));
    const allTaskIds = selectedGroups.flatMap((g) => g.tasks.map((t) => t.id));

    if (adapter.validateBeforeSend) {
      const err = adapter.validateBeforeSend(tasksToSend);
      if (err) {
        sel.setMessage({ text: err, error: true });
        return;
      }
    }

    setSending(true);
    try {
      await sendTasks(adapter.sender, tasksToSend);
      await taskLogRepo.markSent(allTaskIds, adapter.integrationId);
      await adapter.onSendSuccess(allTaskIds);
      sel.setMessage({
        text: `${selectedGroups.length} grupo(s) enviado(s) com sucesso.`,
        error: false,
      });
      sel.deselectAll();
      sel.triggerReload();
    } catch (err) {
      if (err instanceof NoIntegrationError) {
        sel.setMessage({ text: adapter.notConfiguredMessage, error: true });
      } else if (err instanceof NoTasksSelectedError) {
        sel.setMessage({ text: "Selecione ao menos uma tarefa.", error: true });
      } else {
        sel.setMessage({
          text: err instanceof Error ? err.message : "Erro ao enviar.",
          error: true,
        });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">{adapter.title}</h2>
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
                onClick={() => sel.setQuick(q)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  sel.quick === q
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {QUICK_LABELS[q]}
              </button>
            ))}
          </div>

          {sel.quick === "custom" && (
            <div className="flex items-center gap-2 mt-2.5">
              <input
                type="date"
                value={sel.customStart}
                max={sel.customEnd}
                onChange={(e) => sel.setCustomStart(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                autoComplete="off"
              />
              <span className="text-xs text-gray-600">até</span>
              <input
                type="date"
                value={sel.customEnd}
                min={sel.customStart}
                max={todayISO()}
                onChange={(e) => sel.setCustomEnd(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                autoComplete="off"
              />
              <button
                onClick={sel.triggerReload}
                disabled={sel.loading}
                className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded transition-colors"
              >
                {sel.loading ? <Loader2 size={11} className="animate-spin" /> : "Carregar"}
              </button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sel.loading && !sel.loaded ? (
            <div className="flex items-center justify-center py-10 text-gray-600">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : sel.dayGroups.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-10">
              Nenhuma tarefa concluída no período.
            </p>
          ) : (
            <div className="space-y-1">
              {sel.dayGroups.map(({ date, groups }) => {
                const dayKeys = groups.map((g) => selKey(date, g.key));
                const selectedCount = dayKeys.filter((k) => sel.selectedKeys.has(k)).length;
                const allSelected = selectedCount === groups.length;
                const someSelected = selectedCount > 0 && !allSelected;
                const isCollapsed = sel.collapsedDays.has(date);
                const dayTotal = groups.reduce((s, g) => s + g.totalSeconds, 0);

                return (
                  <div key={date} className="rounded-lg overflow-hidden">
                    {/* Day header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 cursor-pointer hover:bg-gray-800 transition-colors select-none"
                      onClick={() => sel.toggleDayCollapse(date)}
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
                          sel.toggleDay(date, groups);
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
                            sentIds={sel.sentIds}
                            selected={sel.selectedKeys.has(selKey(date, g.key))}
                            onToggle={() => sel.toggleGroup(date, g.key, g)}
                            validateTask={adapter.validateTask}
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
        {sel.hasSentSelected && (
          <div className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              {adapter.resendWarning ?? DEFAULT_RESEND_WARNING}
            </p>
          </div>
        )}

        {/* Mensagem de resultado */}
        {sel.message && (
          <p
            className={`mx-5 mb-2 text-xs whitespace-pre-line ${sel.message.error ? "text-red-400" : "text-green-400"}`}
          >
            {sel.message.text}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-800">
          <button
            onClick={sel.selectAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <CheckSquare size={12} />
            Todas
          </button>
          <button
            onClick={sel.deselectAll}
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
            disabled={sending || sel.selectedKeys.size === 0}
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
                Enviar ({sel.selectedKeys.size})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

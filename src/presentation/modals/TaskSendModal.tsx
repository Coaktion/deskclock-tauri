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
import { resolveSentTasks } from "@domain/utils/resolveSentTasks";
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
  buildResultMessage,
  formatDayLabel,
  selKey,
  type QuickPeriod,
  type SendTone,
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

const TONE_CLASS: Record<SendTone, string> = {
  success: "text-billable",
  warning: "text-yellow-300",
  error: "text-danger",
};

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
      className={`flex items-center gap-3 px-3 py-2.5 rounded-control transition-colors ${
        isInvalid ? "opacity-50 cursor-not-allowed" : "hover:bg-raised/50 cursor-pointer"
      }`}
      onClick={isInvalid ? undefined : onToggle}
    >
      <input
        type="checkbox"
        checked={selected && !isInvalid}
        disabled={isInvalid}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 accent-accent cursor-pointer disabled:cursor-not-allowed"
      />

      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: projectColor }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg truncate">{first.name ?? "(sem nome)"}</span>
          {isInvalid && (
            <span className="flex items-center gap-0.5 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full shrink-0">
              <AlertTriangle size={14} />
              Faltando: {validation.missing.join(", ")}
            </span>
          )}
          {!isInvalid && allSent && (
            <span className="flex items-center gap-0.5 text-xs text-billable bg-billable/10 border border-billable/20 px-1.5 py-0.5 rounded-full shrink-0">
              <CheckCheck size={14} />
              Enviado
            </span>
          )}
          {!isInvalid && someSent && (
            <span className="flex items-center gap-0.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded-full shrink-0">
              <AlertTriangle size={14} />
              Parcial
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs text-fg-muted mt-0.5">
          {project && <span>{project.name}</span>}
          {category && <span>{category.name}</span>}
          {group.tasks.length > 1 && (
            <span className="text-fg-muted">{group.tasks.length} registros</span>
          )}
        </div>
      </div>

      <span className="text-xs font-mono tabular-nums text-fg-secondary shrink-0">
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
    if (adapter.validateBeforeSend) {
      const err = adapter.validateBeforeSend(tasksToSend);
      if (err) {
        sel.setMessage({ text: err, tone: "error" });
        return;
      }
    }

    setSending(true);
    try {
      const outcome = await sendTasks(adapter.sender, tasksToSend);

      // Quem conhece o agrupamento da tela é esta tela; o sender só devolve ids.
      // A regra vive em `domain/utils` porque decide o que recebe o badge
      // "Enviado" — e o badge é o que impede o reenvio.
      const sent = resolveSentTasks(selectedGroups, outcome.sentTaskIds, !!adapter.sendsRawTasks);

      if (sent.taskIds.length > 0) {
        await taskLogRepo.markSent(sent.taskIds, adapter.integrationId);
      }

      // O `onSendSuccess` avança o timestamp do envio diário nas três
      // integrações, e a janela do próximo ciclo começa nele: avançá-lo com
      // algo recusado faria o grupo que ficou para trás sair da janela e nunca
      // mais ser tentado sozinho.
      if (outcome.refused.length + outcome.failed.length === 0 && sent.taskIds.length > 0) {
        await adapter.onSendSuccess(sent.taskIds);
      }

      sel.setMessage(buildResultMessage(sent.fullySentGroups, outcome));

      // O reload é o que devolve a seleção certa: o efeito de carga remarca o
      // que ainda não foi inteiramente enviado, então o recusado volta marcado
      // e o que subiu sai — sem precisar mexer na seleção aqui.
      sel.triggerReload();
    } catch (err) {
      if (err instanceof NoIntegrationError) {
        sel.setMessage({ text: adapter.notConfiguredMessage, tone: "error" });
      } else if (err instanceof NoTasksSelectedError) {
        sel.setMessage({ text: "Selecione ao menos uma tarefa.", tone: "error" });
      } else {
        sel.setMessage({
          text: err instanceof Error ? err.message : "Erro ao enviar.",
          tone: "error",
        });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-semibold text-fg">{adapter.title}</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Selecione o período e as tarefas a enviar
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Período */}
        <div className="px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(QUICK_LABELS) as QuickPeriod[]).map((q) => (
              <button
                key={q}
                onClick={() => sel.setQuick(q)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  sel.quick === q
                    ? "bg-accent text-white"
                    : "bg-raised text-fg-secondary hover:text-fg"
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
                className="bg-raised border border-border rounded-chip px-2 py-1 text-xs text-fg focus:outline-none focus:border-accent"
                autoComplete="off"
              />
              <span className="text-xs text-fg-muted">até</span>
              <input
                type="date"
                value={sel.customEnd}
                min={sel.customStart}
                max={todayISO()}
                onChange={(e) => sel.setCustomEnd(e.target.value)}
                className="bg-raised border border-border rounded-chip px-2 py-1 text-xs text-fg focus:outline-none focus:border-accent"
                autoComplete="off"
              />
              <button
                onClick={sel.triggerReload}
                disabled={sel.loading}
                className="flex items-center gap-1 text-xs bg-border hover:opacity-90 text-fg-secondary px-2.5 py-1 rounded-chip transition"
              >
                {sel.loading ? <Loader2 size={14} className="animate-spin" /> : "Carregar"}
              </button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sel.loading && !sel.loaded ? (
            <div className="flex items-center justify-center py-10 text-fg-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : sel.dayGroups.length === 0 ? (
            <p className="text-sm text-fg-muted text-center py-10">
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
                  <div key={date} className="rounded-control overflow-hidden">
                    {/* Day header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-raised/60 cursor-pointer hover:bg-raised transition-colors select-none"
                      onClick={() => sel.toggleDayCollapse(date)}
                    >
                      <div
                        className={`w-4 h-4 border rounded-chip flex items-center justify-center transition-colors flex-shrink-0 ${
                          allSelected
                            ? "bg-accent border-accent"
                            : someSelected
                              ? "bg-accent/30 border-accent/50"
                              : "border-border bg-transparent"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          sel.toggleDay(date, groups);
                        }}
                      >
                        {allSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        {someSelected && <div className="w-2 h-0.5 bg-accent rounded-sm" />}
                      </div>

                      <span className="flex-1 text-xs font-medium text-fg-secondary capitalize">
                        {formatDayLabel(date)}
                      </span>

                      <span className="text-xs text-fg-muted">
                        {selectedCount}/{groups.length}
                      </span>

                      <span className="text-xs font-mono tabular-nums text-fg-muted mr-1">
                        {formatDurationCompact(dayTotal)}
                      </span>

                      {isCollapsed ? (
                        <ChevronRight size={14} className="text-fg-muted shrink-0" />
                      ) : (
                        <ChevronDown size={14} className="text-fg-muted shrink-0" />
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
          <div className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-control">
            <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              {adapter.resendWarning ?? DEFAULT_RESEND_WARNING}
            </p>
          </div>
        )}

        {/* Mensagem de resultado */}
        {sel.message && (
          <p className={`mx-5 mb-2 text-xs whitespace-pre-line ${TONE_CLASS[sel.message.tone]}`}>
            {sel.message.text}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            onClick={sel.selectAll}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg-secondary transition-colors"
          >
            <CheckSquare size={14} />
            Todas
          </button>
          <button
            onClick={sel.deselectAll}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg-secondary transition-colors"
          >
            <Square size={14} />
            Nenhuma
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-xs text-fg-muted hover:text-fg-secondary px-3 py-1.5 rounded-control transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sel.selectedKeys.size === 0}
            className="flex items-center gap-1.5 text-xs bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-control transition"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send size={14} />
                Enviar ({sel.selectedKeys.size})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

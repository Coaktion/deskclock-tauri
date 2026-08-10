import { useState } from "react";
import {
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
import { Badge, Button, FilterPill, Input, Modal } from "@presentation/components/ui";
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
  success: "text-success",
  warning: "text-warning",
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
          {/* Faltar dado desabilita a seleção do grupo — é impedimento, não
              aviso, e por isso o vermelho e não o âmbar do "Parcial". */}
          {isInvalid && (
            <Badge tone="danger" icon={<AlertTriangle size={14} />}>
              Faltando: {validation.missing.join(", ")}
            </Badge>
          )}
          {!isInvalid && allSent && (
            <Badge tone="success" icon={<CheckCheck size={14} />}>
              Enviado
            </Badge>
          )}
          {!isInvalid && someSent && (
            <Badge tone="warning" icon={<AlertTriangle size={14} />}>
              Parcial
            </Badge>
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
    <Modal
      title={adapter.title}
      description="Selecione o período e as tarefas a enviar"
      size="lg"
      tall
      onClose={onClose}
      bodyClassName="px-2 py-2"
      toolbar={
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(QUICK_LABELS) as QuickPeriod[]).map((q) => (
              <FilterPill
                key={q}
                size="sm"
                active={sel.quick === q}
                onClick={() => sel.setQuick(q)}
              >
                {QUICK_LABELS[q]}
              </FilterPill>
            ))}
          </div>

          {sel.quick === "custom" && (
            <div className="flex items-center gap-2 mt-2.5">
              <Input
                type="date"
                size="sm"
                aria-label="Início do período"
                value={sel.customStart}
                max={sel.customEnd}
                onChange={(e) => sel.setCustomStart(e.target.value)}
                className="w-auto"
              />
              <span className="text-sm text-fg-muted">até</span>
              <Input
                type="date"
                size="sm"
                aria-label="Fim do período"
                value={sel.customEnd}
                min={sel.customStart}
                max={todayISO()}
                onChange={(e) => sel.setCustomEnd(e.target.value)}
                className="w-auto"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={sel.triggerReload}
                loading={sel.loading}
              >
                Carregar
              </Button>
            </div>
          )}
        </>
      }
      // Sem aviso nem resultado a faixa não existe — um fragmento vazio é um nó
      // verdadeiro e deixaria a folga do bloco desenhada à toa.
      notice={
        sel.hasSentSelected || sel.message ? (
          <>
            {sel.hasSentSelected && (
              <div className="flex items-start gap-2 px-3 py-2 bg-warning/10 border border-warning/20 rounded-control">
                <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  {adapter.resendWarning ?? DEFAULT_RESEND_WARNING}
                </p>
              </div>
            )}
            {sel.message && (
              <p className={`text-xs whitespace-pre-line ${TONE_CLASS[sel.message.tone]}`}>
                {sel.message.text}
              </p>
            )}
          </>
        ) : undefined
      }
      footerStart={
        <>
          <Button variant="ghost" onClick={sel.selectAll} icon={<CheckSquare size={14} />}>
            Todas
          </Button>
          <Button variant="ghost" onClick={sel.deselectAll} icon={<Square size={14} />}>
            Nenhuma
          </Button>
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={sel.selectedKeys.size === 0}
            loading={sending}
            icon={<Send size={14} />}
          >
            {sending ? "Enviando…" : `Enviar (${sel.selectedKeys.size})`}
          </Button>
        </>
      }
    >
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

                  <span className="flex-1 text-sm font-medium text-fg-secondary capitalize">
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
    </Modal>
  );
}

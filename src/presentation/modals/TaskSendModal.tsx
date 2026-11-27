import { useState } from "react";
import {
  Send,
  Loader2,
  CheckSquare,
  Square,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { TaskSendGroupRow } from "./TaskSendGroupRow";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { NoIntegrationError, NoTasksSelectedError } from "@domain/usecases/tasks/SendTasks";
import { sendBlockedReason, sendTaskGroups } from "@domain/usecases/tasks/SendTaskGroups";
import type { TaskSendAdapter } from "@presentation/integrations/taskSendAdapters";
import { formatDurationCompact, todayISO } from "@shared/utils/time";
import { Button, DateRangeInput, FilterPill, Modal } from "@presentation/components/ui";
import {
  useTaskSendSelection,
  buildResultMessage,
  formatDayLabel,
  selKey,
  type QuickPeriod,
  type SendTone,
} from "@presentation/hooks/useTaskSendSelection";

const TONE_CLASS: Record<SendTone, string> = {
  success: "text-success",
  warning: "text-warning",
  error: "text-danger",
};

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
    // Checada aqui antes do `sendTaskGroups` (que repete a checagem) só para o
    // botão não piscar "Enviando…" quando a carga nem pode sair.
    const blocked = sendBlockedReason(adapter, selectedGroups);
    if (blocked) {
      sel.setMessage({ text: blocked, tone: "error" });
      return;
    }

    setSending(true);
    try {
      const result = await sendTaskGroups(adapter, selectedGroups, taskLogRepo);
      if (result.kind === "blocked") {
        sel.setMessage({ text: result.message, tone: "error" });
        return;
      }
      const { outcome, sent } = result;
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
              {/* Eram dois `<input type="date">` nativos — o calendário do sistema
                  operacional, que não é o do app e muda de aparência por SO. O
                  `min`/`max` cruzado que eles usavam para não inverter as pontas
                  virou a troca automática do campo de período. Sem trilho: os
                  atalhos daqui são as pílulas acima. */}
              <DateRangeInput
                startDate={sel.customStart}
                endDate={sel.customEnd}
                onChange={(inicio, fim) => {
                  sel.setCustomStart(inicio);
                  sel.setCustomEnd(fim);
                }}
                presets={[]}
                maxISO={todayISO()}
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
                <p className="text-xs text-warning">{adapter.resendWarning}</p>
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
                      <TaskSendGroupRow
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

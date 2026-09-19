import { useRef, useState } from "react";
import { Play, RefreshCw, Bell, MoreHorizontal } from "lucide-react";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { UUID } from "@shared/types";
import {
  EditPlannedTaskModal,
  type EditPlannedTaskInput,
} from "@presentation/modals/EditPlannedTaskModal";
import { PlannedActionsFlyout } from "@presentation/components/PlannedActionsFlyout";
import { selectionBoxClass } from "@presentation/components/selectionStyles";
import {
  ClickBoundary,
  CompleteToggle,
  IconButton,
  Menu,
  TaskRow,
  type RowExecution,
} from "@presentation/components/ui";
import { isPlayBlocked, playTitle, type PlayBlock } from "@presentation/components/playAction";
import { PLANNED_ROW_KEYS } from "@presentation/components/plannedRowKey";
import { rowKeyDownHandler } from "@presentation/components/rowKey";
import { usePlannedRowMenu } from "@presentation/hooks/usePlannedRowMenu";
import { getProjectColor } from "@shared/utils/projectColor";
import { plannedTaskToSharePayload } from "@domain/utils/sharePayload";
import { buildShareLink } from "@shared/utils/shareLink";
import { showToast } from "@shared/utils/toast";

interface PlannedTaskItemProps {
  task: PlannedTask;
  dateISO: string;
  projects: Project[];
  categories: Category[];
  /**
   * O catálogo inteiro, arquivados inclusive: o link traduz id de campo em
   * rótulo, e valor já gravado num campo arquivado continua valendo.
   * Desce por prop porque a linha é renderizada uma vez por tarefa do dia —
   * `useCustomFields` aqui seria uma carga por linha.
   */
  customFields: CustomField[];
  /** Se a execução em curso impede este ▶ — e, quando ela é esta mesma tarefa, quem o diz. */
  playBlock?: PlayBlock;
  /**
   * O realce da linha em execução, derivado **pela tela**: aqui não há acesso à
   * tarefa em curso, só ao id desta planejada.
   */
  execution?: RowExecution;
  /** true quando o rastreamento automático está acompanhando esta reunião para notificar. */
  tracked?: boolean;
  onPlay: (task: PlannedTask) => void;
  onUpdate: (
    id: string,
    input: {
      name?: string;
      projectId?: UUID | null;
      categoryId?: UUID | null;
      billable?: boolean;
      scheduleType?: ScheduleType;
      scheduleDate?: string | null;
      recurringDays?: number[] | null;
      periodStart?: string | null;
      periodEnd?: string | null;
      actions?: PlannedTaskAction[];
    }
  ) => Promise<void>;
  onComplete: (id: string, date: string) => void;
  onUncomplete: (id: string, date: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function PlannedTaskItem({
  task,
  dateISO,
  projects,
  categories,
  customFields,
  playBlock = "none",
  execution,
  tracked = false,
  onPlay,
  onUpdate,
  onComplete,
  onUncomplete,
  onDuplicate,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: PlannedTaskItemProps) {
  const isCompleted = task.completedDates.includes(dateISO);
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const [showModal, setShowModal] = useState(false);
  const moreRef = useRef<HTMLSpanElement>(null);
  const canPlay = !isCompleted && !isPlayBlocked(playBlock);
  const menu = usePlannedRowMenu({
    onEdit: () => setShowModal(true),
    onDuplicate: () => onDuplicate(task.id),
    onCopyLink: () => void handleShare(),
    onDelete: () => onDelete(task.id),
    disabled: selectMode,
  });

  async function handleSave(id: string, input: EditPlannedTaskInput) {
    await onUpdate(id, input);
  }

  async function handleShare() {
    const link = buildShareLink(
      plannedTaskToSharePayload(task, projects, categories, customFields)
    );
    try {
      await navigator.clipboard.writeText(link);
      await showToast("success", "Link copiado para a área de transferência.");
    } catch {
      await showToast("error", "Não foi possível copiar o link.");
    }
  }

  function toggleComplete() {
    if (isCompleted) onUncomplete(task.id, dateISO);
    else onComplete(task.id, dateISO);
  }

  const handleKeyDown = rowKeyDownHandler(PLANNED_ROW_KEYS, {
    play: () => {
      if (canPlay) onPlay(task);
    },
    toggleComplete,
    edit: () => setShowModal(true),
    duplicate: () => onDuplicate(task.id),
    copyLink: () => void handleShare(),
    delete: () => onDelete(task.id),
  });

  /*
   * O ⚡ saiu daqui e virou o `PlannedActionsFlyout`, no slot `badges`. Com ele
   * foi embora a última razão de a guarda olhar `task.actions`: mantida, a tarefa
   * que só tem ações passaria a desenhar um subtítulo vazio.
   */
  const subtitle = (project || category) && (
    <span className="inline-flex items-center gap-1.5">
      {[project?.name, category?.name].filter(Boolean).join(" · ")}
      {task.scheduleType === "period" && task.periodEnd && <span>até {task.periodEnd}</span>}
    </span>
  );

  return (
    <>
      <TaskRow
        title={task.name}
        completed={isCompleted}
        execution={execution}
        titleMarks={
          (task.scheduleType === "recurring" || tracked) && (
            <>
              {task.scheduleType === "recurring" && (
                <span className="shrink-0 flex items-center text-accent-text/70">
                  <RefreshCw size={14} />
                </span>
              )}
              {tracked && (
                <span
                  className="shrink-0 flex items-center text-accent-text/80"
                  title="Rastreada — o app vai lembrar de iniciar esta reunião"
                >
                  <Bell size={14} />
                </span>
              )}
            </>
          )
        }
        subtitle={subtitle || undefined}
        dotColor={getProjectColor(project)}
        /* Ancorado **depois** da célula que cresce no hover, junto do chip de
           faturamento: é a mesma posição que impede o chip de andar quando o ⋯
           abre.

           Some no modo de seleção pelo mesmo motivo que o Play e o ⋯: ali a
           linha inteira é alvo de marcar, e um controle que engole o clique
           faria a tarefa recusar a seleção justamente enquanto se escolhe o que
           excluir em lote. */
        badges={!selectMode && <PlannedActionsFlyout actions={task.actions} />}
        billable={task.billable}
        /* `onUpdate` é o `update` do usePlannedTasks: recarrega e emite
           PLANNED_TASKS_CHANGED, então o popup acompanha sem nada a mais. */
        onToggleBillable={() => void onUpdate(task.id, { billable: !task.billable })}
        leading={
          selectMode ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(task.id)}
              onClick={(e) => e.stopPropagation()}
              className={selectionBoxClass}
            />
          ) : (
            <CompleteToggle completed={isCompleted} onToggle={toggleComplete} />
          )
        }
        selected={selected}
        onClick={selectMode ? () => onToggleSelect?.(task.id) : () => setShowModal(true)}
        onContextMenu={selectMode ? undefined : menu.openAtPointer}
        onKeyDown={selectMode ? undefined : handleKeyDown}
        /* Sem hover o ⋯ não ocupa largura nenhuma: reservado, o espaço dele sai
           do nome da tarefa, que trunca numa linha vazia à direita (§5.3). */
        collapseActions
        actions={
          !selectMode && (
            <ClickBoundary ref={moreRef}>
              <IconButton
                icon={<MoreHorizontal size={14} />}
                title="Mais ações"
                size="sm"
                pressed={menu.fromTrigger}
                onClick={() => menu.toggleFrom(moreRef.current)}
              />
            </ClickBoundary>
          )
        }
        /* Sempre presente, e da largura do Play mesmo vazia: na concluída e no
           modo de seleção a coluna fica, ou o chip saltaria a largura dela a
           cada conclusão e a cada entrada no modo. */
        trailing={
          <span className="flex w-7 justify-center" data-play-slot>
            {!selectMode && !isCompleted && (
              <ClickBoundary>
                <IconButton
                  icon={<Play size={16} fill="currentColor" />}
                  title={playTitle(playBlock)}
                  variant="primary"
                  size="md"
                  disabled={isPlayBlocked(playBlock)}
                  onClick={() => onPlay(task)}
                />
              </ClickBoundary>
            )}
          </span>
        }
      />

      {!selectMode && (
        <Menu
          anchor={menu.anchor}
          items={menu.items}
          onClose={menu.close}
          label="Ações da tarefa"
        />
      )}

      {showModal && !selectMode && (
        <EditPlannedTaskModal
          task={task}
          projects={projects}
          categories={categories}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

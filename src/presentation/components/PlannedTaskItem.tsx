import { useState } from "react";
import {
  Play,
  Check,
  Copy,
  Trash2,
  RotateCcw,
  Pencil,
  RefreshCw,
  Bell,
  Share2,
} from "lucide-react";
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
import { IconButton, TaskRow, type RowExecution } from "@presentation/components/ui";
import { isPlayBlocked, playTitle, type PlayBlock } from "@presentation/components/playAction";
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
           faturamento: é a mesma posição que impede o chip de andar quando a
           fileira de botões abre.

           Some no modo de seleção pelo mesmo motivo que os seis botões abaixo:
           ali a linha inteira é alvo de marcar, e um controle que engole o
           clique faria a tarefa recusar a seleção justamente enquanto se
           escolhe o que excluir em lote. */
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
          ) : undefined
        }
        selected={selected}
        onClick={selectMode ? () => onToggleSelect?.(task.id) : undefined}
        /* Sem hover os botões não ocupam largura nenhuma: reservados, o espaço
           de seis botões sai do nome da tarefa, que trunca numa linha vazia à
           direita (§5.3). */
        collapseActions
        actions={
          !selectMode && (
            <>
              {!isCompleted && (
                <IconButton
                  icon={<Play size={14} />}
                  title={playTitle(playBlock)}
                  size="sm"
                  disabled={isPlayBlocked(playBlock)}
                  onClick={() => onPlay(task)}
                />
              )}
              <IconButton
                icon={<Share2 size={14} />}
                title="Compartilhar"
                size="sm"
                onClick={() => void handleShare()}
              />
              <IconButton
                icon={<Pencil size={14} />}
                title="Editar"
                size="sm"
                onClick={() => setShowModal(true)}
              />
              <IconButton
                icon={isCompleted ? <RotateCcw size={14} /> : <Check size={14} />}
                title={isCompleted ? "Marcar como pendente" : "Concluir"}
                size="sm"
                onClick={() =>
                  isCompleted ? onUncomplete(task.id, dateISO) : onComplete(task.id, dateISO)
                }
              />
              <IconButton
                icon={<Copy size={14} />}
                title="Duplicar"
                size="sm"
                variant="neutral"
                onClick={() => onDuplicate(task.id)}
              />
              <IconButton
                icon={<Trash2 size={14} />}
                title="Excluir"
                size="sm"
                variant="danger"
                onClick={() => onDelete(task.id)}
              />
            </>
          )
        }
      />

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

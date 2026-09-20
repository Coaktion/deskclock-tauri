import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { PlannedPlaySlot } from "@presentation/components/PlannedPlaySlot";
import { copyPlannedTaskLink } from "@presentation/components/plannedShareLink";
import { isPlayBlocked, type PlayBlock } from "@presentation/components/playAction";
import { PLANNED_ROW_KEYS } from "@presentation/components/plannedRowKey";
import { rowKeyDownHandler } from "@presentation/components/rowKey";
import { TrackedMeetingMark } from "@presentation/components/TrackedMeetingMark";
import {
  CompleteToggle,
  Menu,
  RowMenuTrigger,
  TaskRow,
  type RowExecution,
} from "@presentation/components/ui";
import { usePlannedRowMenu } from "@presentation/hooks/usePlannedRowMenu";
import { getProjectColor } from "@shared/utils/projectColor";

interface PopupPlannedRowProps {
  task: PlannedTask;
  projects: Project[];
  categories: Category[];
  /**
   * O catálogo inteiro, arquivados inclusive: o link traduz id de campo em
   * rótulo, e valor gravado num campo arquivado continua valendo. Desce por
   * prop pelo mesmo motivo do `PlannedTaskItem` — uma carga por linha, não.
   */
  customFields: CustomField[];
  /** O rastreamento automático vai lembrar de iniciar esta reunião. */
  tracked: boolean;
  /** Se a execução em curso impede este ▶ — e, quando ela nasceu desta planejada, quem o diz. */
  playBlock: PlayBlock;
  /** O realce da execução em curso, derivado **pela tela**: aqui só há o id da planejada. */
  execution?: RowExecution;
  onEdit: (task: PlannedTask) => void;
  onComplete: (task: PlannedTask) => void;
  onPlay: (task: PlannedTask) => void;
  onDuplicate: (task: PlannedTask) => void;
  onDelete: (task: PlannedTask) => void;
}

/**
 * A linha da planejada no popup, no desenho da linha do Planejamento
 * (`PlannedTaskItem`, spec `acoes-da-linha-planejada.md`): círculo e Play
 * sempre visíveis, o raro no ⋯ e no clique direito, clique na linha edita.
 *
 * O que muda em relação ao Planejamento é o que o popup não tem: modo de
 * seleção, tarefa concluída na lista (a aba mostra só as pendentes) e chip de
 * faturamento — este nunca esteve na linha do popup, e os 264 px não o pedem.
 *
 * O horário continua no slot da **duração**, e desde a H2 ele não recua mais: o
 * ⋯ tem coluna própria, antes do chip, e o horário fica legível com o cursor
 * sobre a linha. O que isso cobra nos 264 px úteis é largura do nome — o ⋯
 * deixou de dividir a célula com o horário —, e é o preço declarado da H2.
 */
export function PopupPlannedRow({
  task,
  projects,
  categories,
  customFields,
  tracked,
  playBlock,
  execution,
  onEdit,
  onComplete,
  onPlay,
  onDuplicate,
  onDelete,
}: PopupPlannedRowProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
  // A mesma leitura de `groupPlannedBySchedule`, ou a linha em branco cairia na
  // seção "sem hora" e ainda assim desenharia a célula do horário.
  const startTime = task.startTime?.trim() || undefined;
  const menu = usePlannedRowMenu({
    onEdit: () => onEdit(task),
    onDuplicate: () => onDuplicate(task),
    onCopyLink: () => void handleCopyLink(),
    onDelete: () => onDelete(task),
    actions: task.actions,
  });

  const handleCopyLink = () => copyPlannedTaskLink(task, projects, categories, customFields);

  const handleKeyDown = rowKeyDownHandler(PLANNED_ROW_KEYS, {
    play: () => {
      if (!isPlayBlocked(playBlock)) onPlay(task);
    },
    // Só pendente chega aqui: concluir tira a linha da lista, e não há reabrir.
    toggleComplete: () => onComplete(task),
    edit: () => onEdit(task),
    duplicate: () => onDuplicate(task),
    copyLink: () => void handleCopyLink(),
    delete: () => onDelete(task),
  });

  return (
    <>
      <TaskRow
        title={task.name}
        execution={execution}
        titleMarks={tracked ? <TrackedMeetingMark /> : undefined}
        subtitle={subtitle || undefined}
        dotColor={getProjectColor(project)}
        leading={<CompleteToggle completed={false} onToggle={() => onComplete(task)} />}
        onClick={() => onEdit(task)}
        onContextMenu={menu.openAtPointer}
        onKeyDown={handleKeyDown}
        duration={startTime}
        actions={<RowMenuTrigger menu={menu} />}
        /* Da largura do Play, como no Planejamento. Aqui a coluna nunca fica
           vazia — não há concluída nem modo de seleção —, mas o bloqueado segue
           visível e desabilitado, então o chip também não anda por ele. */
        trailing={<PlannedPlaySlot playBlock={playBlock} onPlay={() => onPlay(task)} />}
      />

      {/* Irmão da linha, e não filho: os atalhos do menu não chegam à linha. O
          ESC dele é consumido e contido, então não alcança o listener do
          `PopupOverlayApp` que esconde a janela. */}
      <Menu anchor={menu.anchor} items={menu.items} onClose={menu.close} label="Ações da tarefa" />
    </>
  );
}

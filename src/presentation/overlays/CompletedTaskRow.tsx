import type { Category } from "@domain/entities/Category";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { ENTRY_ROW_KEYS } from "@presentation/components/entryRowKey";
import { isPlayBlocked, type PlayBlock } from "@presentation/components/playAction";
import { PlannedPlaySlot } from "@presentation/components/PlannedPlaySlot";
import { rowKeyDownHandler } from "@presentation/components/rowKey";
import { Menu, RowMenuTrigger, TaskRow, type RowExecution } from "@presentation/components/ui";
import { useEntryRowMenu } from "@presentation/hooks/useEntryRowMenu";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatDurationCompact } from "@shared/utils/time";

interface CompletedTaskRowProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  /**
   * As ações da planejada que originou o lançamento, que o menu lista no início
   * (H1). Vêm da seção porque é ela que tem o índice de planejadas do dia; o ⚡
   * que morava no slot `badges` saiu junto.
   */
  actions: PlannedTaskAction[];
  /** Se a execução em curso impede este ▶ — e, quando ela é deste grupo, quem o diz. */
  playBlock: PlayBlock;
  /** O realce da execução em curso, derivado pela seção: aqui só há a chave do grupo. */
  execution?: RowExecution;
  /** Inicia uma nova execução com os dados da tarefa concluída (repetir). */
  onRepeat: (group: TaskGroup) => void;
  /** Abre a edição do grupo no painel que cobre o popup. */
  onEdit: (group: TaskGroup) => void;
  /** O popup passa o `removeWithUndo` do `useTaskUndo`: excluir aqui se desfaz. */
  onDelete: (group: TaskGroup) => void;
}

/**
 * A linha da aba "Executadas" do popup, no desenho das Entradas de hoje
 * (`TaskCard`, spec `acoes-da-linha-planejada.md`, H3): o ▶ fixo na coluna que
 * não anda — aqui ele **repete** o lançamento —, Editar e Excluir no ⋯ e no
 * clique direito, clique na linha edita. **Sem círculo**: lançamento não se
 * conclui.
 *
 * A linha é um **grupo** (§6.3), e é o grupo que cada ação opera: editar vale
 * para todas as irmãs, excluir apaga todas — com desfazer —, e repetir copia os
 * dados da primeira, como o botão "Repetir tarefa" já fazia.
 */
export function CompletedTaskRow({
  group,
  projects,
  categories,
  actions,
  playBlock,
  execution,
  onRepeat,
  onEdit,
  onDelete,
}: CompletedTaskRowProps) {
  const first = group.tasks[0];
  const project = projects.find((p) => p.id === first.projectId);
  const category = categories.find((c) => c.id === first.categoryId);
  const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
  const count = group.tasks.length;

  const menu = useEntryRowMenu({
    onEdit: () => onEdit(group),
    onDelete: () => onDelete(group),
    actions,
  });

  const handleKeyDown = rowKeyDownHandler(ENTRY_ROW_KEYS, {
    play: () => {
      if (!isPlayBlocked(playBlock)) onRepeat(group);
    },
    edit: () => onEdit(group),
    delete: () => onDelete(group),
  });

  return (
    <>
      <TaskRow
        title={first.name || "(sem nome)"}
        /* Quantas irmãs o grupo tem. Vai **ao lado** do nome e não dentro
           dele: a contagem é o que diz que aquela linha resume várias, e
           dentro do `<p>` ela era a primeira a sumir num nome longo. A
           coluna de 88px que a tela de Tarefas usa para isso não cabe nos
           288px do popup — sobrariam ~78px para o nome. */
        titleMarks={
          count > 1 ? (
            <span className="shrink-0 text-micro font-mono tabular-nums text-fg-muted">
              {count}x
            </span>
          ) : undefined
        }
        subtitle={subtitle || undefined}
        execution={execution}
        dotColor={getProjectColor(project)}
        duration={formatDurationCompact(group.totalSeconds)}
        onClick={() => onEdit(group)}
        onContextMenu={menu.openAtPointer}
        onKeyDown={handleKeyDown}
        actions={<RowMenuTrigger menu={menu} />}
        /* O ▶ das Entradas, com o rótulo desta lista: aqui ele repete um
           lançamento em vez de iniciar um do zero. O bloqueio tem a redação
           de sempre (`playTitle`), que não muda por tela. */
        trailing={
          <PlannedPlaySlot
            playBlock={playBlock}
            idleTitle="Repetir com estes dados"
            onPlay={() => onRepeat(group)}
          />
        }
      />

      {/* Irmão da linha, e não filho: os atalhos do menu não chegam à linha. O
          ESC dele é consumido e contido, então não alcança o listener do
          `PopupOverlayApp` que esconde a janela. */}
      <Menu
        anchor={menu.anchor}
        items={menu.items}
        onClose={menu.close}
        label="Ações do lançamento"
      />
    </>
  );
}

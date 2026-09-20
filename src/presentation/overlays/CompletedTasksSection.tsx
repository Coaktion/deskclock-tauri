import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { actionsOfTasks, type PlannedIndex } from "@domain/utils/plannedActions";
import { executionOf, resolvePlayBlock } from "@presentation/components/playAction";
import { SectionHeading } from "@presentation/components/ui/SectionHeading";
import { CompletedTaskRow } from "@presentation/overlays/CompletedTaskRow";
import { formatDurationCompact } from "@shared/utils/time";

interface CompletedTasksSectionProps {
  groups: TaskGroup[];
  totalSeconds: number;
  projects: Project[];
  categories: Category[];
  /**
   * Chave de agrupamento da execução em curso (§6.3), ou `null` sem execução.
   * A linha que a compartilha diz "já está em execução"; as demais, que não dá
   * para iniciar outra.
   */
  runningGroupKey: string | null;
  /**
   * A execução em curso, para o realce da linha que a compartilha. Vem junto da
   * chave e não derivada de fora porque quem tem o `PlayBlock` de cada grupo é
   * esta seção: derivar lá em cima seria a mesma leitura feita duas vezes.
   */
  runningTask: Task | null;
  /**
   * As planejadas do dia por id, **concluídas inclusive**, para a seção de ações
   * do menu de cada grupo. A ação é lida da planejada agora, não da execução —
   * a `Task` nunca a copiou —, então a origem excluída não deixa ação e a
   * editada mostra a nova.
   */
  plannedIndex: PlannedIndex;
  /** Inicia uma nova execução com os dados da tarefa concluída (repetir). */
  onRepeat: (group: TaskGroup) => void;
  /** Abre a edição do grupo no painel que cobre o popup. */
  onEdit: (group: TaskGroup) => void;
  /** O popup passa o `removeWithUndo` do `useTaskUndo`: excluir aqui se desfaz. */
  onDelete: (group: TaskGroup) => void;
}

/**
 * Conteúdo da aba "Executadas": resumo do total do dia + lista rolável de tarefas
 * concluídas, agrupadas por nome+projeto+categoria. Preenche a altura do container
 * pai (h-full) — o popup define uma área fixa e a lista rola internamente.
 */
export function CompletedTasksSection({
  groups,
  totalSeconds,
  projects,
  categories,
  runningGroupKey,
  runningTask,
  plannedIndex,
  onRepeat,
  onEdit,
  onDelete,
}: CompletedTasksSectionProps) {
  if (groups.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-center text-fg-muted text-xs">Nenhuma tarefa executada hoje</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Resumo do total do dia */}
      <SectionHeading>
        <div className="flex items-center gap-2">
          Total do dia
          <span className="ml-auto text-xs tabular-nums text-fg-secondary font-mono">
            {formatDurationCompact(totalSeconds)}
          </span>
        </div>
      </SectionHeading>

      {/* Lista agrupada */}
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const block = resolvePlayBlock(runningGroupKey, group.key);

          return (
            <CompletedTaskRow
              key={group.key}
              group={group}
              projects={projects}
              categories={categories}
              actions={actionsOfTasks(plannedIndex, group.tasks)}
              playBlock={block}
              execution={executionOf(block, runningTask)}
              onRepeat={onRepeat}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );
        })}
      </div>
    </div>
  );
}

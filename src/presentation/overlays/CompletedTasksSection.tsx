import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { IconButton, TaskRow } from "@presentation/components/ui";
import { SectionHeading } from "@presentation/components/ui/SectionHeading";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatDurationCompact } from "@shared/utils/time";
import { Pen, Play } from "lucide-react";

interface CompletedTasksSectionProps {
  groups: TaskGroup[];
  totalSeconds: number;
  projects: Project[];
  categories: Category[];
  /** Inicia uma nova execução com os dados da tarefa concluída (repetir). */
  onRepeat: (group: TaskGroup) => void;
  /** Abre a edição do grupo no painel que cobre o popup. */
  onEdit: (group: TaskGroup) => void;
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
  onRepeat,
  onEdit,
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
          const first = group.tasks[0];
          const project = projects.find((p) => p.id === first.projectId);
          const category = categories.find((c) => c.id === first.categoryId);
          const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
          const count = group.tasks.length;

          return (
            <TaskRow
              key={group.key}
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
              dotColor={getProjectColor(project)}
              duration={formatDurationCompact(group.totalSeconds)}
              /* Editar antes de repetir, a mesma ordem da linha planejada:
                 primeiro o que ajusta o registro, depois o que age. */
              actions={
                <>
                  <IconButton
                    icon={<Pen size={14} />}
                    title="Editar"
                    size="sm"
                    onClick={() => onEdit(group)}
                  />
                  <IconButton
                    icon={<Play size={14} fill="currentColor" />}
                    title="Repetir tarefa"
                    size="sm"
                    onClick={() => onRepeat(group)}
                  />
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

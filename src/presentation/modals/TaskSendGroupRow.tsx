import { AlertTriangle, CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { TaskValidationResult } from "@domain/integrations/taskValidation";
import { formatDurationCompact } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { Badge } from "@presentation/components/ui";

/** Uma linha (grupo) da lista do `TaskSendModal`. */
interface TaskSendGroupRowProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  sentIds: Set<string>;
  selected: boolean;
  onToggle: () => void;
  validateTask: (task: Task) => TaskValidationResult;
}

export function TaskSendGroupRow({
  group,
  projects,
  categories,
  sentIds,
  selected,
  onToggle,
  validateTask,
}: TaskSendGroupRowProps) {
  const first = group.tasks[0];
  const project = projects.find((p) => p.id === first.projectId);
  const category = categories.find((c) => c.id === first.categoryId);
  const allSent = group.tasks.every((t) => sentIds.has(t.id));
  const someSent = !allSent && group.tasks.some((t) => sentIds.has(t.id));
  const projectColor = getProjectColor(project);
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

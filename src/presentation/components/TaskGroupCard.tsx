import { useState } from "react";
import { ChevronDown, ChevronRight, Merge, CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@shared/utils/groupTasks";
import { formatDurationCompact } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { TaskCard } from "./TaskCard";

interface TaskGroupCardProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  playDisabled?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (group: TaskGroup) => void;
  onPlay: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMerge: (group: TaskGroup) => void;
  onToggleBillable: (task: Task) => void;
}

export function TaskGroupCard({
  group,
  projects,
  categories,
  playDisabled = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  onPlay,
  onEdit,
  onDelete,
  onMerge,
  onToggleBillable,
}: TaskGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { tasks } = group;
  const first = tasks[0];
  const project = projects.find((p) => p.id === first.projectId);
  const category = categories.find((c) => c.id === first.categoryId);
  const displayName = first.name ?? "(sem nome)";
  const isGroup = tasks.length > 1;
  const allSent = tasks.every((t) => t.sentToSheets);
  const someSent = !allSent && tasks.some((t) => t.sentToSheets);

  function handleRowClick() {
    if (selectable) {
      onToggleSelect?.(group);
    } else if (isGroup) {
      setExpanded((v) => !v);
    }
  }

  const projectColor = getProjectColor(first.projectId);

  // Tarefa individual sem agrupamento: renderiza direto sem cabeçalho de grupo
  if (!isGroup && !selectable) {
    return (
      <TaskCard
        task={first}
        projects={projects}
        categories={categories}
        playDisabled={playDisabled}
        onPlay={onPlay}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleBillable={onToggleBillable}
      />
    );
  }

  return (
    <div>
      <div
        className="relative flex items-center gap-2 pl-3 pr-2 py-2.5 cursor-pointer hover:bg-gray-800/50 rounded-lg transition-colors"
        onClick={handleRowClick}
      >
        {/* Billable left accent */}
        {first.billable && (
          <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-500 rounded-r-full" />
        )}

        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect?.(group);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 accent-blue-500 cursor-pointer"
          />
        ) : (
          isGroup && (
            <span className="text-gray-500 flex-shrink-0">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )
        )}

        {/* Project color dot */}
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: projectColor }}
        />

        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-100 truncate block">{displayName}</span>
          <div className="flex gap-2 text-[11px] text-gray-500 mt-0.5">
            {project && <span>{project.name}</span>}
            {category && <span>{category.name}</span>}
            {isGroup && <span className="text-gray-600">{tasks.length} registros</span>}
          </div>
        </div>
        <span className="text-sm font-mono tabular-nums text-gray-300 flex-shrink-0">
          {formatDurationCompact(group.totalSeconds)}
        </span>
        {(allSent || someSent) && (
          <span
            title={allSent ? "Enviado para o Google Sheets" : "Enviado parcialmente"}
            className={`flex-shrink-0 ${allSent ? "text-green-500" : "text-yellow-500"}`}
          >
            <CheckCheck size={13} />
          </span>
        )}
        {isGroup && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMerge(group);
            }}
            title="Unificar"
            className="p-1 text-gray-500 hover:text-blue-400 flex-shrink-0"
          >
            <Merge size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="pl-4 ml-3 border-l border-gray-800">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              projects={projects}
              categories={categories}
              playDisabled={playDisabled}
              onPlay={onPlay}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleBillable={onToggleBillable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

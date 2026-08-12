import type { Task } from "@domain/entities/Task";
import { WorkspaceEdge } from "@presentation/components/WorkspaceDot";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS, todayISO } from "@shared/utils/time";
import { ListTodo } from "lucide-react";

interface CompactOverlayContentProps {
  runningTask: Task | null;
  isPopupOpen: boolean;
  onMouseDown: () => void;
  onTogglePopup: () => void;
}

export function CompactOverlayContent({
  runningTask,
  isPopupOpen,
  onMouseDown,
  onTogglePopup,
}: CompactOverlayContentProps) {
  const today = todayISO();
  const { tasks } = usePlannedTasksForDate(today);
  const pendingCount = tasks.filter((t) => !t.completedDates.includes(today)).length;
  const seconds = useTaskTimer(runningTask);
  const { workspaces, activeWorkspace } = useWorkspaces();
  // Só sinaliza quando há mais de um workspace: com um só, a bolinha seria ruído
  // permanente num overlay de 68px.
  const showWorkspace = workspaces.length > 1 && !!activeWorkspace;

  const isRunning = runningTask?.status === "running";
  const isPaused = runningTask?.status === "paused";
  const hasTask = !!runningTask;

  const borderClass = isRunning
    ? "border-accent overlay-ring-pulse"
    : isPaused
      ? "border-paused"
      : isPopupOpen
        ? "border-accent"
        : "border-border";

  const timerColor = isPaused ? "text-paused" : "text-accent-text";

  const maxW = "max-w-[68px]";
  const maxH = "max-h-[44px]";
  const rounded = "rounded-chip";
  const roundedTop = "rounded-t-chip";
  const roundedBottom = "rounded-b-chip";
  const timerSize = "text-sm";
  // O contador é um dígito só na maioria das vezes: pode ser maior que o timer
  // sem estourar a caixa, e é o que o torna legível de relance.
  const countSize = "text-base";

  return (
    // inset-0 + m-auto centraliza dentro da janela (que no GTK pode ser 136px+).
    // max-w/max-h limitam a área visível ao tamanho correto.
    <div
      data-tauri-drag-region
      className={`flex flex-col w-full h-full ${maxW} ${maxH} m-auto absolute inset-0 cursor-move bg-surface border shadow-xl transition-colors duration-200 ${rounded} ${borderClass}`}
      title={
        (hasTask ? "Ver tarefa em execução" : "Ver tarefas planejadas") +
        (showWorkspace ? ` — ${activeWorkspace!.name}` : "")
      }
    >
      <button
        onMouseDown={onMouseDown}
        onClick={onTogglePopup}
        className={`group relative flex items-center justify-center hover:bg-raised/60 transition-colors w-full flex-1 cursor-pointer ${roundedTop} overflow-hidden`}
      >
        {/* Só sobre o botão, nunca sobre a barra do grip. */}
        {showWorkspace && <WorkspaceEdge color={activeWorkspace!.color} />}
        {hasTask ? (
          <span
            className={`relative font-mono ${timerSize} font-semibold tabular-nums pointer-events-none leading-none ${timerColor}`}
          >
            {formatHHMMSS(seconds)}
          </span>
        ) : pendingCount > 0 ? (
          // Em repouso, o número é a informação — o ícone só repetiria o que o
          // overlay já é. Fica no centro, no lugar do ícone, e não como badge de
          // canto: a 68px o badge era pequeno demais para se ler de relance.
          <span
            className={`relative ${countSize} font-semibold tabular-nums pointer-events-none leading-none text-accent-text`}
          >
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        ) : (
          <ListTodo size={18} className={`relative text-accent-text pointer-events-none`} />
        )}
      </button>

      <div
        data-tauri-drag-region
        className={`p-1 gap-0.5 pointer-events-none flex flex-col items-center justify-center bg-raised ${roundedBottom}`}
      >
        <div className="flex gap-0.5">
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
        </div>
        <div className="flex gap-0.5">
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
          <span className="w-[3px] h-[3px] bg-fg-secondary rounded-full" />
        </div>
      </div>
    </div>
  );
}

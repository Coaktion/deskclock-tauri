import type { Task } from "@domain/entities/Task";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS, todayISO } from "@shared/utils/time";
import { ListTodo } from "lucide-react";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { WorkspaceEdge } from "@presentation/components/WorkspaceDot";

interface CompactOverlayContentProps {
  runningTask: Task | null;
  isPopupOpen: boolean;
  overlaySize: "big" | "small";
  onMouseDown: () => void;
  onTogglePopup: () => void;
}

export function CompactOverlayContent({
  runningTask,
  isPopupOpen,
  overlaySize,
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
    ? "border-blue-500 overlay-ring-pulse"
    : isPaused
      ? "border-amber-500"
      : isPopupOpen
        ? "border-blue-500"
        : "border-gray-700";

  const timerColor = isPaused ? "text-amber-400" : "text-blue-400";

  const isSmall = overlaySize === "small";
  const maxW = isSmall ? "max-w-[68px]" : "max-w-[78px]";
  const maxH = isSmall ? "max-h-[44px]" : "max-h-[52px]";
  const rounded = isSmall ? "rounded-[6px]" : "rounded-xl";
  const roundedTop = isSmall ? "rounded-t-[6px]" : "rounded-t-xl";
  const roundedBottom = isSmall ? "rounded-b-[6px]" : "rounded-b-xl";
  const timerSize = isSmall ? "text-[12px]" : "text-[14px]";
  // O contador é um dígito só na maioria das vezes: pode ser maior que o timer
  // sem estourar a caixa, e é o que o torna legível de relance.
  const countSize = isSmall ? "text-[15px]" : "text-[17px]";

  // Disco atrás do ícone/timer: é ele que abre o vazio entre as duas crescentes,
  // dispensando uma camada de recorte. Só existe quando há cor para separar —
  // sem crescentes, o disco seria invisível em repouso e ainda assim criaria um
  // segundo blend no hover do botão.
  const centerBackdrop = showWorkspace
    ? "box-content p-1 rounded-full bg-gray-900 group-hover:bg-gray-800/60 transition-colors"
    : "";

  return (
    // inset-0 + m-auto centraliza dentro da janela (que no GTK pode ser 136px+).
    // max-w/max-h limitam a área visível ao tamanho correto.
    <div
      data-tauri-drag-region
      className={`flex flex-col w-full h-full ${maxW} ${maxH} m-auto absolute inset-0 cursor-move bg-gray-900 border shadow-xl transition-colors duration-200 ${rounded} ${borderClass}`}
      title={
        (hasTask ? "Ver tarefa em execução" : "Ver tarefas planejadas") +
        (showWorkspace ? ` — ${activeWorkspace!.name}` : "")
      }
    >
      <button
        onMouseDown={onMouseDown}
        onClick={onTogglePopup}
        className={`group relative flex items-center justify-center hover:bg-gray-800/60 transition-colors w-full flex-1 cursor-pointer ${roundedTop}`}
      >
        {/* Só sobre o botão, nunca sobre a barra do grip. */}
        {showWorkspace && <WorkspaceEdge color={activeWorkspace!.color} className={roundedTop} />}
        {hasTask ? (
          <span
            className={`relative ${centerBackdrop} font-mono ${timerSize} font-semibold tabular-nums pointer-events-none leading-none ${timerColor}`}
          >
            {formatHHMMSS(seconds)}
          </span>
        ) : pendingCount > 0 ? (
          // Em repouso, o número é a informação — o ícone só repetiria o que o
          // overlay já é. Fica no centro, no lugar do ícone, e não como badge de
          // canto: a 68px o badge era pequeno demais para se ler de relance.
          <span
            className={`relative ${centerBackdrop} ${countSize} font-semibold tabular-nums pointer-events-none leading-none text-blue-400`}
          >
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        ) : (
          <ListTodo
            size={18}
            className={`relative ${centerBackdrop} text-blue-400 pointer-events-none`}
          />
        )}
      </button>

      <div
        data-tauri-drag-region
        className={`p-1 gap-0.5 pointer-events-none flex flex-col items-center justify-center bg-gray-800 ${roundedBottom}`}
      >
        <div className="flex gap-0.5">
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
        </div>
        <div className="flex gap-0.5">
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}

import { Pause, Play, X } from "lucide-react";
import { Button, IconButton } from "@presentation/components/ui";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS } from "@shared/utils/time";

interface TitleBarRunningTaskProps {
  /** Quem chama leva o usuário ao omnibox, que é o dono do fluxo de parada. */
  onStopRequest: () => void;
}

export function TitleBarRunningTask({ onStopRequest }: TitleBarRunningTaskProps) {
  const { runningTask, pauseTask, resumeTask, cancelTask } = useRunningTask();
  const seconds = useTaskTimer(runningTask);

  if (!runningTask) return null;

  const isRunning = runningTask.status === "running";

  return (
    <div className="flex items-center gap-2 h-full min-w-0 px-2">
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full ${isRunning ? "bg-accent" : "bg-paused"}`}
      />
      <span
        className={`text-sm truncate max-w-56 ${runningTask.name ? "text-fg-secondary" : "text-fg-muted italic"}`}
      >
        {runningTask.name ?? "(sem nome)"}
      </span>
      <span
        className={`shrink-0 font-mono tabular-nums text-sm font-medium ${
          isRunning ? "text-accent-text" : "text-paused"
        }`}
      >
        {formatHHMMSS(seconds)}
      </span>
      <IconButton
        size="sm"
        icon={isRunning ? <Pause size={14} /> : <Play size={14} />}
        title={isRunning ? "Pausar" : "Retomar"}
        onClick={() => void (isRunning ? pauseTask() : resumeTask())}
      />
      <Button variant="danger" onClick={onStopRequest} title="Parar tarefa">
        Parar
      </Button>
      {/* O traço separa o descarte da ação que salva, como no omnibox: lado a
          lado, o Cancelar ficava a um pixel do Parar. */}
      <span className="shrink-0 w-px h-4 mx-1 bg-border-subtle" />
      <IconButton
        size="sm"
        variant="danger"
        icon={<X size={14} />}
        title="Cancelar tarefa"
        onClick={() => void cancelTask()}
      />
    </div>
  );
}

import { Pause, Play, Square, X } from "lucide-react";
import { runningPlannedTaskId } from "@domain/utils/plannedLink";
import { PlannedActionsFlyout } from "@presentation/components/PlannedActionsFlyout";
import { ExecutionDot, IconButton } from "@presentation/components/ui";
import { usePlannedTaskActions } from "@presentation/hooks/usePlannedTaskActions";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS } from "@shared/utils/time";

interface TitleBarRunningTaskProps {
  /** Quem chama leva o usuário ao omnibox, que é o dono do fluxo de parada. */
  onStopRequest: () => void;
  /** Clique no rótulo (ponto, nome e cronômetro): leva ao omnibox da tela de Tarefas. */
  onOpenRequest: () => void;
}

export function TitleBarRunningTask({ onStopRequest, onOpenRequest }: TitleBarRunningTaskProps) {
  const { runningTask, activePlannedTaskId, pauseTask, resumeTask, cancelTask } = useRunningTask();
  const seconds = useTaskTimer(runningTask);
  const actions = usePlannedTaskActions(runningPlannedTaskId(activePlannedTaskId, runningTask));

  if (!runningTask) return null;

  const isRunning = runningTask.status === "running";

  return (
    <div className="flex items-center h-full min-w-0 px-2">
      <div
        className={`flex items-center gap-2 h-6 min-w-0 pl-2 pr-0.5 border rounded-chip ${
          isRunning ? "border-accent/40 bg-accent/5" : "border-paused/40 bg-paused/5"
        }`}
      >
        {/* Quem abre é o rótulo, não o chip: `role="button"` na casca torna
            presentacionais os botões de dentro, e o leitor de tela anunciaria
            todos como um só. É o mesmo recorte do nome no overlay popup.

            O realce do hover mora aqui, e não na casca: aceso no chip inteiro,
            ele prometia clique na borda e no vão entre os botões, onde não há. */}
        <button
          type="button"
          onClick={onOpenRequest}
          title="Abrir na tela de Tarefas"
          className={`flex items-center gap-2 min-w-0 text-left rounded-chip transition-colors ${
            isRunning ? "hover:bg-accent/10" : "hover:bg-paused/10"
          }`}
        >
          <ExecutionDot execution={isRunning ? "running" : "paused"} />
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
        </button>
        {/* O ⚡ fica do lado de Pausar e Parar, e não além do traço: ele age
            sobre a tarefa, não a descarta. Sem ações, não desenha nada. */}
        <PlannedActionsFlyout actions={actions} />
        <IconButton
          size="sm"
          icon={isRunning ? <Pause size={14} /> : <Play size={14} />}
          title={isRunning ? "Pausar" : "Retomar"}
          onClick={() => void (isRunning ? pauseTask() : resumeTask())}
        />
        {/* Quadrado preenchido: vazio ele é a caixa desmarcada dos modais de
            seleção, e é o preenchimento que o lê como parar.

            A variante **diverge do omnibox de propósito**. Lá o Parar é uma
            caixa vermelha com texto e o Cancelar é um glifo neutro, e os dois
            se distinguem pela forma. Aqui não há forma: em 32px os dois são
            glifos do mesmo tamanho, a um traço de distância. Então o vermelho é
            gasto no que não se desfaz — o descarte —, e o Parar fica em
            `accent`, seguindo a regra do `IconButton` de a cor ser o destino da
            ação. */}
        <IconButton
          size="sm"
          icon={<Square size={14} fill="currentColor" />}
          title="Parar tarefa"
          onClick={onStopRequest}
        />
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
    </div>
  );
}

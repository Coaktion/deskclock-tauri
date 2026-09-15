import { Maximize2, Minimize2, Pin, PinOff, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import type { Page } from "./Sidebar";
import { TitleBarRunningTask } from "./TitleBarRunningTask";

const appWindow = getCurrentWindow();

const PAGE_LABELS: Record<Page, string> = {
  tasks: "Tarefas",
  retroactive: "Lançamento Manual",
  planning: "Planejamento",
  history: "Histórico",
  data: "Dados",
  integrations: "Integrações",
  settings: "Configurações",
};

interface TitleBarProps {
  page: Page;
  showPin: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  /** Parar da barra: leva à tela de Tarefas e abre lá o fluxo de parada do omnibox. */
  onStopRequest: () => void;
}

export function TitleBar({ page, showPin, isPinned, onTogglePin, onStopRequest }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const toggleMaximize = () => appWindow.toggleMaximize();

  return (
    // Grade 1fr/auto/1fr: as duas laterais medem o mesmo, então o bloco do meio
    // fica no centro da janela, e não no centro do que sobra entre rótulo e
    // controles. O bloco não é região de arraste — senão os cliques viram arrastar.
    <div className="h-8 bg-canvas border-b border-border-subtle grid grid-cols-[1fr_auto_1fr] items-center shrink-0 select-none">
      {/* Área de arraste */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-3 h-full min-w-0">
        <span className="text-sm font-semibold text-fg-muted tracking-wide">DeskClock</span>
        <span className="text-fg-muted text-sm">·</span>
        <span className="text-sm text-fg-secondary truncate">{PAGE_LABELS[page]}</span>
      </div>

      {/* Na tela de Tarefas o omnibox já mostra a tarefa e o cronômetro. */}
      <div className="h-full min-w-0">
        {page !== "tasks" && <TitleBarRunningTask onStopRequest={onStopRequest} />}
      </div>

      {/* Controles da janela, precedidos de vão arrastável */}
      <div className="flex items-center h-full min-w-0">
        <div data-tauri-drag-region className="flex-1 h-full" />
        {showPin && (
          <button
            onClick={onTogglePin}
            title={
              isPinned
                ? "Desafixar janela (fecha ao perder foco)"
                : "Fixar janela (não fecha ao perder foco)"
            }
            className={`h-full px-3 transition-colors ${
              isPinned
                ? "text-accent-text hover:bg-raised"
                : "text-fg-muted hover:text-fg-secondary hover:bg-raised"
            }`}
          >
            {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
        )}
        <button
          onClick={toggleMaximize}
          title={isMaximized ? "Restaurar" : "Maximizar"}
          className="h-full px-3 text-fg-muted hover:text-fg hover:bg-raised transition-colors"
        >
          {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          onClick={() => appWindow.hide()}
          title="Fechar (minimiza para o tray)"
          className="h-full px-4 text-fg-muted hover:text-white hover:bg-danger transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

import { Maximize2, Minimize2, Pin, PinOff, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import type { Page } from "./Sidebar";

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
}

export function TitleBar({ page, showPin, isPinned, onTogglePin }: TitleBarProps) {
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
    <div className="h-8 bg-canvas border-b border-border-subtle flex items-center shrink-0 select-none">
      {/* Área de arraste */}
      <div data-tauri-drag-region className="flex-1 flex items-center gap-2 px-3 h-full min-w-0">
        <span className="text-sm font-semibold text-fg-muted tracking-wide">DeskClock</span>
        <span className="text-fg-muted text-sm">·</span>
        <span className="text-sm text-fg-secondary truncate">{PAGE_LABELS[page]}</span>
      </div>

      {/* Controles da janela */}
      <div className="flex items-center h-full shrink-0">
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

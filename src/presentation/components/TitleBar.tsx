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
    <div className="h-8 bg-gray-950 border-b border-gray-800 flex items-center shrink-0 select-none">
      {/* Área de arraste */}
      <div data-tauri-drag-region className="flex-1 flex items-center gap-2 px-3 h-full min-w-0">
        <span className="text-xs font-semibold text-gray-500 tracking-wide">DeskClock</span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-xs text-gray-400 truncate">{PAGE_LABELS[page]}</span>
      </div>

      {/* Controles da janela */}
      <div className="flex items-center h-full shrink-0">
        {showPin && (
          <button
            onClick={onTogglePin}
            title={isPinned ? "Desafixar janela (fecha ao perder foco)" : "Fixar janela (não fecha ao perder foco)"}
            className={`h-full px-3 transition-colors ${
              isPinned
                ? "text-blue-400 hover:text-blue-300 hover:bg-gray-800"
                : "text-gray-600 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
          </button>
        )}
        <button
          onClick={toggleMaximize}
          title={isMaximized ? "Restaurar" : "Maximizar"}
          className="h-full px-3 text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          onClick={() => appWindow.hide()}
          title="Fechar (minimiza para o tray)"
          className="h-full px-4 text-gray-500 hover:text-white hover:bg-red-600 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

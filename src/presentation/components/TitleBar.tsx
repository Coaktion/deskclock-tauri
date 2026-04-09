import { Minus, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
}

export function TitleBar({ page }: TitleBarProps) {
  return (
    <div className="h-8 bg-gray-950 border-b border-gray-800 flex items-center shrink-0 select-none">
      {/* Área de arraste — ocupa todo o espaço exceto os botões */}
      <div data-tauri-drag-region className="flex-1 flex items-center gap-2 px-3 h-full min-w-0">
        <span className="text-xs font-semibold text-gray-500 tracking-wide">DeskClock</span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-xs text-gray-400 truncate">{PAGE_LABELS[page]}</span>
      </div>

      {/* Controles da janela */}
      <div className="flex items-center h-full shrink-0">
        <button
          onClick={() => appWindow.minimize()}
          title="Minimizar"
          className="h-full px-4 text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <Minus size={12} />
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

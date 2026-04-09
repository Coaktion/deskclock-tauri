import { Timer, Database, CalendarDays, History, Settings, MessageSquare, FileClock } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

export type Page = "tasks" | "data" | "planning" | "history" | "retroactive" | "settings";

interface SidebarProps {
  current: Page;
  onChange: (page: Page) => void;
}

const ITEMS: { page: Page; icon: React.ReactNode; label: string }[] = [
  { page: "tasks",       icon: <Timer size={20} />,        label: "Tarefas" },
  { page: "data",        icon: <Database size={20} />,     label: "Dados" },
  { page: "planning",    icon: <CalendarDays size={20} />, label: "Planejamento" },
  { page: "history",     icon: <History size={20} />,      label: "Histórico" },
  { page: "retroactive", icon: <FileClock size={20} />,    label: "Lançamento retroativo" },
  { page: "settings",    icon: <Settings size={20} />,     label: "Configurações" },
];

const FEEDBACK_URL = "https://github.com/emeirav/deskclock-tauri/issues";

export function Sidebar({ current, onChange }: SidebarProps) {
  return (
    <nav className="fixed left-0 top-0 h-full w-14 bg-gray-950 border-r border-gray-800 flex flex-col items-center py-4 z-30">
      <div className="flex flex-col items-center gap-1 flex-1">
        {ITEMS.map(({ page, icon, label }) => (
          <button
            key={page}
            onClick={() => onChange(page)}
            title={label}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              current === page
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            {icon}
          </button>
        ))}
      </div>

      <button
        onClick={() => openUrl(FEEDBACK_URL).catch(() => {})}
        title="Enviar feedback"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
      >
        <MessageSquare size={18} />
      </button>
    </nav>
  );
}

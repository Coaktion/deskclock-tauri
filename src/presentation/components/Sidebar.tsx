import {
  Timer,
  Database,
  CalendarDays,
  History,
  Settings,
  MessageSquare,
  FileClock,
  Plug,
} from "lucide-react";
import { openInBrowser, getPlatform } from "@shared/utils/shell";
import { WorkspaceSwitcher } from "@presentation/components/WorkspaceSwitcher";

export type Page =
  "tasks" | "data" | "planning" | "history" | "retroactive" | "integrations" | "settings";

interface SidebarProps {
  current: Page;
  onChange: (page: Page) => void;
}

const ITEMS: { page: Page; icon: React.ReactNode; label: string; short: string }[] = [
  { page: "tasks", icon: <Timer size={18} />, label: "Tarefas", short: "Tarefas" },
  {
    page: "retroactive",
    icon: <FileClock size={18} />,
    label: "Lançamento manual",
    short: "Manual",
  },
  { page: "planning", icon: <CalendarDays size={18} />, label: "Planejamento", short: "Planos" },
  { page: "history", icon: <History size={18} />, label: "Histórico", short: "Histórico" },
  { page: "data", icon: <Database size={18} />, label: "Dados", short: "Dados" },
  { page: "integrations", icon: <Plug size={18} />, label: "Integrações", short: "Integrações" },
  { page: "settings", icon: <Settings size={18} />, label: "Configurações", short: "Config." },
];

const FEEDBACK_BASE_URL = "https://forms.monday.com/forms/5bb4399c79149a4a3714b97b852d6d21?r=use1";

async function openFeedback() {
  const os = await getPlatform();
  await openInBrowser(`${FEEDBACK_BASE_URL}&os=${os}`);
}

export function Sidebar({ current, onChange }: SidebarProps) {
  return (
    <nav className="w-[68px] shrink-0 h-full bg-canvas border-r border-border-subtle flex flex-col items-center py-3 z-30">
      <WorkspaceSwitcher />

      <div className="flex flex-col items-center gap-0.5 flex-1 w-full px-1">
        {ITEMS.map(({ page, icon, label, short }) => (
          <button
            key={page}
            onClick={() => onChange(page)}
            title={label}
            className={`relative w-full flex flex-col items-center gap-0.5 py-2 px-1 rounded-control transition-colors ${
              current === page
                ? "bg-accent/10 text-accent-text"
                : "text-fg-muted hover:text-fg hover:bg-raised"
            }`}
          >
            {current === page && (
              <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-r-full" />
            )}
            {icon}
            <span className="text-sm font-medium leading-none truncate max-w-full">{short}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => openFeedback().catch(() => {})}
        title="Enviar feedback"
        className="w-12 flex flex-col items-center gap-0.5 py-1.5 rounded-control text-fg-muted hover:text-fg-secondary hover:bg-raised transition-colors"
      >
        <MessageSquare size={16} />
        <span className="text-sm font-medium leading-none">Feedback</span>
      </button>
    </nav>
  );
}

import {
  Timer,
  Database,
  CalendarDays,
  History,
  Settings,
  MessageSquare,
  FileClock,
  Plug,
  ClipboardPaste,
} from "lucide-react";
import { openInBrowser, getPlatform } from "@shared/utils/shell";
import { WorkspaceSwitcher } from "@presentation/components/WorkspaceSwitcher";

export type Page =
  "tasks" | "data" | "planning" | "history" | "retroactive" | "integrations" | "settings";

interface SidebarProps {
  current: Page;
  onChange: (page: Page) => void;
  /** Abre o modal de colar deeplink. O estado dele mora no `App`: a barra
   *  dispara a ação, não a hospeda. */
  onOpenPasteLink: () => void;
}

/**
 * Um item da barra é uma **página** ou uma **ação**, e os dois se desenham
 * iguais. O que os separa é só o despacho do clique — e é por isso que a união
 * fica no tipo, e não em dois `map()`: o segundo elemento seria um botão escrito
 * de novo, com o realce de "página atual" que a ação não pode ter e com a caixa
 * divergindo no primeiro ajuste que alguém fizesse num dos dois.
 */
type SidebarItem = { key: string; icon: React.ReactNode; label: string; short: string } & (
  { page: Page } | { onSelect: () => void }
);

function buildItems(onOpenPasteLink: () => void): SidebarItem[] {
  return [
    { key: "tasks", page: "tasks", icon: <Timer size={18} />, label: "Tarefas", short: "Tarefas" },
    {
      key: "retroactive",
      page: "retroactive",
      icon: <FileClock size={18} />,
      label: "Lançamento manual",
      short: "Manual",
    },
    {
      key: "planning",
      page: "planning",
      icon: <CalendarDays size={18} />,
      label: "Planejamento",
      short: "Planos",
    },
    {
      key: "history",
      page: "history",
      icon: <History size={18} />,
      label: "Histórico",
      short: "Histórico",
    },
    { key: "data", page: "data", icon: <Database size={18} />, label: "Dados", short: "Dados" },
    {
      key: "integrations",
      page: "integrations",
      icon: <Plug size={18} />,
      label: "Integrações",
      short: "Integrações",
    },
    {
      key: "paste-link",
      onSelect: onOpenPasteLink,
      icon: <ClipboardPaste size={18} />,
      label: "Receber link",
      short: "Receber",
    },
    {
      key: "settings",
      page: "settings",
      icon: <Settings size={18} />,
      label: "Configurações",
      short: "Config.",
    },
  ];
}

const FEEDBACK_BASE_URL = "https://forms.monday.com/forms/5bb4399c79149a4a3714b97b852d6d21?r=use1";

async function openFeedback() {
  const os = await getPlatform();
  await openInBrowser(`${FEEDBACK_BASE_URL}&os=${os}`);
}

export function Sidebar({ current, onChange, onOpenPasteLink }: SidebarProps) {
  return (
    <nav className="w-[68px] shrink-0 h-full bg-canvas border-r border-border-subtle flex flex-col items-center py-3 z-30">
      <WorkspaceSwitcher />

      <div className="flex flex-col items-center gap-0.5 flex-1 w-full px-1">
        {buildItems(onOpenPasteLink).map((item) => {
          // Só página tem "atual" — a ação nunca acende nem ganha a barrinha.
          const active = "page" in item && item.page === current;
          return (
            <button
              key={item.key}
              onClick={() => ("page" in item ? onChange(item.page) : item.onSelect())}
              title={item.label}
              className={`relative w-full flex flex-col items-center gap-1 py-2 px-1 rounded-control transition-colors ${
                active
                  ? "bg-accent/10 text-accent-text"
                  : "text-fg-muted hover:text-fg hover:bg-raised"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-r-full" />
              )}
              {item.icon}
              <span className="text-nav font-medium truncate max-w-full">{item.short}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => openFeedback().catch(() => {})}
        title="Enviar feedback"
        className="w-12 flex flex-col items-center gap-1 py-1.5 rounded-control text-fg-muted hover:text-fg-secondary hover:bg-raised transition-colors"
      >
        <MessageSquare size={16} />
        <span className="text-nav font-medium">Feedback</span>
      </button>
    </nav>
  );
}

import { useEffect, useRef, useState, useMemo, useCallback, Fragment } from "react";
import {
  Search,
  Play,
  FileClock,
  CalendarDays,
  History,
  Database,
  Settings,
  Plug,
  Timer,
  Send,
  FileDown,
} from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Page } from "@presentation/components/Sidebar";

interface StartTaskInput {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable: boolean;
  plannedTaskId?: string | null;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onStartTask: (input: StartTaskInput) => Promise<void>;
  plannedTasks: PlannedTask[];
  projects: Project[];
  shortcutLabel?: string;
  standalone?: boolean;
}

interface CommandItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  kbd?: string;
  group: string;
  action: () => void | Promise<void>;
}

// Fuzzy match: returns score >= 0 if query chars appear in order in text, else -1.
// Higher score = better match (consecutive matches and early matches score more).
function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  // Exact substring wins
  const exactIdx = t.indexOf(q);
  if (exactIdx !== -1) return 2000 - exactIdx;
  // Fuzzy: all chars must appear in order
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastMatch = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      consecutive = lastMatch === i - 1 ? consecutive + 1 : 0;
      score += 10 + consecutive * 8 - i * 0.1;
      lastMatch = i;
    }
  }
  return qi < q.length ? -1 : score;
}

// Highlight matching chars in text for a given query (fuzzy)
function highlightFuzzy(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  // Collect matched char indices
  const matched = new Set<number>();
  // Try exact first
  const exactIdx = t.indexOf(q);
  if (exactIdx !== -1) {
    for (let i = exactIdx; i < exactIdx + q.length; i++) matched.add(i);
  } else {
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) { matched.add(i); qi++; }
    }
  }
  if (!matched.size) return text;
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < text.length; i++) {
    if (matched.has(i)) {
      parts.push(<span key={i} className="text-blue-300 font-semibold">{text[i]}</span>);
    } else {
      parts.push(<Fragment key={i}>{text[i]}</Fragment>);
    }
  }
  return <>{parts}</>;
}

const NAV_ITEMS: { page: Page; label: string; icon: React.ReactNode; kbd: string }[] = [
  { page: "tasks", label: "Tarefas", icon: <Timer size={16} />, kbd: "Ctrl+1" },
  { page: "retroactive", label: "Manual", icon: <FileClock size={16} />, kbd: "Ctrl+2" },
  { page: "planning", label: "Planejamento", icon: <CalendarDays size={16} />, kbd: "Ctrl+3" },
  { page: "history", label: "Histórico", icon: <History size={16} />, kbd: "Ctrl+4" },
  { page: "data", label: "Dados", icon: <Database size={16} />, kbd: "Ctrl+5" },
  { page: "integrations", label: "Integrações", icon: <Plug size={16} />, kbd: "Ctrl+6" },
  { page: "settings", label: "Configurações", icon: <Settings size={16} />, kbd: "Ctrl+7" },
];

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onStartTask,
  plannedTasks,
  projects,
  shortcutLabel = "Ctrl+K",
  standalone = false,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const handleNavigate = useCallback(
    (page: Page) => {
      onNavigate(page);
      onClose();
    },
    [onNavigate, onClose]
  );

  const handleStartTask = useCallback(
    async (input: StartTaskInput) => {
      await onStartTask(input);
      onClose();
    },
    [onStartTask, onClose]
  );

  const allItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      {
        id: "action-start",
        group: "Ações",
        icon: <Play size={16} />,
        label: "Iniciar nova tarefa",
        subtitle: "Inicia tarefa em branco agora",
        action: () => handleStartTask({ billable: true }),
      },
      {
        id: "action-retroactive",
        group: "Ações",
        icon: <FileClock size={16} />,
        label: "Adicionar entrada manual",
        subtitle: "Lançamento retroativo",
        action: () => handleNavigate("retroactive"),
      },
      {
        id: "action-sheets",
        group: "Ações",
        icon: <Send size={16} />,
        label: "Enviar ao Google Sheets",
        subtitle: "Ir para integrações",
        action: () => handleNavigate("integrations"),
      },
      {
        id: "action-export",
        group: "Ações",
        icon: <FileDown size={16} />,
        label: "Exportar CSV",
        subtitle: "Ir para histórico",
        action: () => handleNavigate("history"),
      },
    ];

    const nav: CommandItem[] = NAV_ITEMS.map((item) => ({
      id: `nav-${item.page}`,
      group: "Ir para",
      icon: item.icon,
      label: item.label,
      kbd: item.kbd,
      action: () => handleNavigate(item.page),
    }));

    const planned: CommandItem[] = plannedTasks.map((task) => {
      const proj = projects.find((p) => p.id === task.projectId);
      const projName = proj ? (proj.name.length > 30 ? proj.name.slice(0, 30) + "…" : proj.name) : undefined;
      return {
        id: `planned-${task.id}`,
        group: "Iniciar tarefa planejada",
        icon: <Play size={16} />,
        label: task.name,
        subtitle: projName,
        action: () =>
          handleStartTask({
            name: task.name,
            projectId: task.projectId,
            categoryId: task.categoryId,
            billable: task.billable,
            plannedTaskId: task.id,
          }),
      };
    });

    return [...actions, ...nav, ...planned];
  }, [plannedTasks, projects, handleNavigate, handleStartTask]);

  const filtered = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return allItems;
    const q = query.trim();
    return allItems
      .map((item) => {
        const labelScore = fuzzyScore(item.label, q);
        const subtitleScore = item.subtitle ? fuzzyScore(item.subtitle, q) : -1;
        const score = Math.max(labelScore, subtitleScore);
        return { item, score };
      })
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [allItems, query]);

  // Clamp focusedIndex when filtered list changes
  useEffect(() => {
    setFocusedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${focusedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  function onKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd+1–7: navigate to page directly
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const pages: Page[] = ["tasks", "retroactive", "planning", "history", "data", "integrations", "settings"];
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < pages.length) {
        e.preventDefault();
        void handleNavigate(pages[idx]);
        return;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[focusedIndex];
      if (item) void item.action();
    }
  }

  // Group items for rendering
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const existing = map.get(item.group);
      if (existing) {
        existing.push(item);
      } else {
        map.set(item.group, [item]);
      }
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Build flat index → item mapping for focused tracking
  const flatItems = useMemo(() => filtered, [filtered]);

  let globalIndex = 0;

  if (!open) return null;

  const box = (
    <div
      className="w-[520px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
      onMouseDown={(e) => standalone && e.stopPropagation()}
    >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search size={16} className="text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusedIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar ação, tela, ou tarefa planejada…"
            className="flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder-gray-500"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Nenhum resultado encontrado
            </p>
          )}

          {groups.map(([groupLabel, items]) => (
            <div key={groupLabel}>
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {groupLabel}
              </div>
              {items.map((item) => {
                const idx = flatItems.indexOf(item);
                const isFocused = idx === focusedIndex;
                globalIndex++;
                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                      isFocused ? "bg-blue-500/15" : "hover:bg-gray-800/60"
                    }`}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void item.action();
                    }}
                  >
                    <span className={`w-4 h-4 shrink-0 ${isFocused ? "text-blue-400" : "text-gray-400"}`}>
                      {item.icon}
                    </span>
                    <span className="flex-1 text-gray-200">{highlightFuzzy(item.label, query)}</span>
                    {item.subtitle && (
                      <span className="text-xs text-gray-500">{highlightFuzzy(item.subtitle, query)}</span>
                    )}
                    {item.kbd && (
                      <kbd className="text-[10px] font-mono text-gray-600 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded">
                        {item.kbd}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10.5px] text-gray-600">
          <span><kbd className="font-mono">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono">Enter</kbd> executar</span>
          <span><kbd className="font-mono">Esc</kbd> fechar</span>
          {shortcutLabel && <span className="ml-auto">{shortcutLabel} a qualquer momento</span>}
        </div>
      </div>
  );

  if (standalone) return box;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20"
      onMouseDown={() => onClose()}
    >
      {box}
    </div>
  );
}

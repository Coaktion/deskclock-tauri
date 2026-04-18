import { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
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
        action: () => handleNavigate("tasks"),
      },
      {
        id: "action-retroactive",
        group: "Ações",
        icon: <FileClock size={16} />,
        label: "Lançamento manual",
        action: () => handleNavigate("retroactive"),
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

    const planned: CommandItem[] = plannedTasks.map((task) => ({
      id: `planned-${task.id}`,
      group: "Tarefas planejadas",
      icon: <Play size={16} />,
      label: task.name,
      action: () =>
        handleStartTask({
          name: task.name,
          projectId: task.projectId,
          categoryId: task.categoryId,
          billable: task.billable,
          plannedTaskId: task.id,
        }),
    }));

    return [...actions, ...nav, ...planned];
  }, [plannedTasks, handleNavigate, handleStartTask]);

  const filtered = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.subtitle ?? "").toLowerCase().includes(q)
    );
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20"
      onMouseDown={() => onClose()}
    >
      <div
        className="w-[520px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
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
            placeholder="Buscar ação ou página..."
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
                    <span className="flex-1 text-gray-200">{item.label}</span>
                    {item.subtitle && (
                      <span className="text-xs text-gray-500">{item.subtitle}</span>
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
        <div className="px-4 py-2 border-t border-gray-800 flex gap-4 text-[10.5px] text-gray-600">
          <span>
            <kbd className="font-mono">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> selecionar
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}

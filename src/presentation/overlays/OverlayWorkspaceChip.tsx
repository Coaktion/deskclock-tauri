import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Clock } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { WorkspaceDot } from "@presentation/components/WorkspaceDot";

interface OverlayWorkspaceChipProps {
  runningTask: Task | null;
  onStop: (completed: boolean) => Promise<void>;
}

/** Ancoragem dos menus, medida na janela do popup. */
const MENU_POS = { top: "2rem", right: "4rem" } as const;

/**
 * Workspace ativo no cabeçalho do popup, com troca no próprio overlay.
 *
 * Os menus usam `position: fixed`, não `absolute`: o cabeçalho do popup tem
 * `overflow-hidden` (para o arredondamento do topo), então um menu ancorado no
 * chip seria recortado pelo pai. `fixed` tira o menu do fluxo e do clipping —
 * o que também preserva as alturas fixas por estado do popup (`EXEC_H`,
 * `CONTENT_H`…), que redimensionam a janela do Tauri a cada mudança.
 *
 * Some quando só existe um workspace, igual ao switcher da sidebar.
 */
export function OverlayWorkspaceChip({ runningTask, onStop }: OverlayWorkspaceChipProps) {
  const { workspaces, activeWorkspaceId, activeWorkspace, switchTo } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !pendingId) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPendingId(null);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, pendingId]);

  if (workspaces.length <= 1 || !activeWorkspace) return null;

  async function handlePick(id: string) {
    if (id === activeWorkspaceId) {
      setOpen(false);
      return;
    }
    if (runningTask) {
      setPendingId(id);
      setOpen(false);
      return;
    }
    await switchTo(id);
    setOpen(false);
  }

  async function handleStopAndSwitch(completed: boolean) {
    const id = pendingId;
    if (!id) return;
    setPendingId(null);
    await onStop(completed);
    await switchTo(id);
  }

  const pending = workspaces.find((w) => w.id === pendingId) ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Workspace: ${activeWorkspace.name}`}
        className="flex items-center gap-1 max-w-[92px] px-1.5 py-0.5 rounded-lg hover:bg-gray-700 transition-colors"
      >
        <WorkspaceDot color={activeWorkspace.color} size={7} />
        <span className="text-[10px] text-gray-400 truncate">{activeWorkspace.name}</span>
      </button>

      {open && (
        <div
          style={MENU_POS}
          className="fixed z-50 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => void handlePick(w.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <WorkspaceDot color={w.color} size={7} />
              <span className="flex-1 text-left truncate">{w.name}</span>
              {w.id === activeWorkspaceId && <Check size={11} className="text-gray-500" />}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div
          style={MENU_POS}
          className="fixed z-50 w-52 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2"
        >
          <p className="text-[11px] text-gray-300 leading-snug mb-1.5">
            Parar a tarefa e trocar para <span className="text-gray-100">{pending.name}</span>?
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void handleStopAndSwitch(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
            >
              <CheckCircle2 size={11} />
              Concluída
            </button>
            <button
              onClick={() => void handleStopAndSwitch(false)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
            >
              <Clock size={11} />
              Pendente
            </button>
            <button
              onClick={() => setPendingId(null)}
              className="ml-auto px-1 text-[11px] text-gray-500 hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

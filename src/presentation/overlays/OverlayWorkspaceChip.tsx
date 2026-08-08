import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Clock } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useWorkspaceSwitchGuard } from "@presentation/hooks/useWorkspaceSwitchGuard";
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
  const { workspaces, activeWorkspaceId, activeWorkspace } = useWorkspaces();
  const { pending, request, confirm, cancel } = useWorkspaceSwitchGuard({
    runningTask,
    stopTask: onStop,
  });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !pending) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        cancel();
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, pending, cancel]);

  if (workspaces.length <= 1 || !activeWorkspace) return null;

  async function handlePick(id: string) {
    await request(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Workspace: ${activeWorkspace.name}`}
        className="flex items-center gap-1 max-w-[92px] px-1.5 py-0.5 rounded-control hover:bg-border transition-colors"
      >
        <WorkspaceDot color={activeWorkspace.color} size={7} />
        <span className="text-xs text-fg-secondary truncate">{activeWorkspace.name}</span>
      </button>

      {open && (
        <div
          style={MENU_POS}
          className="fixed z-50 w-44 bg-surface border border-border rounded-control shadow-2xl py-1"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => void handlePick(w.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-fg-secondary hover:bg-raised transition-colors"
            >
              <WorkspaceDot color={w.color} size={7} />
              <span className="flex-1 text-left truncate">{w.name}</span>
              {w.id === activeWorkspaceId && <Check size={14} className="text-fg-muted" />}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div
          style={MENU_POS}
          className="fixed z-50 w-52 bg-surface border border-border rounded-control shadow-2xl p-2"
        >
          <p className="text-xs text-fg-secondary leading-snug mb-1.5">
            Parar a tarefa e trocar para <span className="text-fg">{pending.name}</span>?
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void confirm(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-billable hover:opacity-90 text-white rounded-chip transition"
            >
              <CheckCircle2 size={14} />
              Concluída
            </button>
            <button
              onClick={() => void confirm(false)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-border hover:opacity-90 text-fg rounded-chip transition"
            >
              <Clock size={14} />
              Pendente
            </button>
            <button
              onClick={cancel}
              className="ml-auto px-1 text-xs text-fg-muted hover:text-fg-secondary"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

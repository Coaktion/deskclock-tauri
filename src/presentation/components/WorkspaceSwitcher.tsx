import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Clock, Layers, X } from "lucide-react";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useWorkspaceSwitchGuard } from "@presentation/hooks/useWorkspaceSwitchGuard";
import { WorkspaceDot, workspaceClasses } from "@presentation/components/WorkspaceDot";

/**
 * Seletor de workspace na sidebar.
 *
 * Com um único workspace o componente **não renderiza nada** — quem não usa
 * workspaces não vê workspace nenhum.
 *
 * A guarda de tarefa em execução está em `useWorkspaceSwitchGuard`, compartilhada
 * com o chip do overlay e com a aba Workspaces da tela de Dados.
 */
export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, activeWorkspace } = useWorkspaces();
  const { runningTask, stopTask } = useRunningTask();
  const { pending, request, confirm, cancel } = useWorkspaceSwitchGuard({ runningTask, stopTask });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !pending) return;
    function dismiss() {
      setOpen(false);
      cancel();
    }
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) dismiss();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pending, cancel]);

  if (workspaces.length <= 1) return null;

  async function handlePick(id: string) {
    await request(id);
    setOpen(false);
  }

  const active = activeWorkspace;
  const classes = workspaceClasses(active?.color ?? "");

  return (
    <div ref={rootRef} className="relative w-full px-1 mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        title={active ? `Workspace: ${active.name}` : "Workspace"}
        className={`w-full flex flex-col items-center gap-2 py-2 px-1 rounded-control border transition-colors ${
          open ? classes.soft : "border-transparent hover:bg-raised"
        }`}
      >
        {active ? <WorkspaceDot color={active.color} size={10} /> : <Layers size={14} />}
        <span
          className={`text-xs font-medium leading-none truncate max-w-full ${
            open ? classes.text : "text-fg-muted"
          }`}
        >
          {active?.name ?? "Workspace"}
        </span>
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-1 z-50 w-52 bg-surface border border-border rounded-card shadow-2xl py-1">
          <p className="px-3 py-1.5 text-overline uppercase text-fg-muted">Workspace</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => void handlePick(w.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-fg-secondary hover:bg-raised transition-colors"
            >
              <WorkspaceDot color={w.color} />
              <span className="flex-1 text-left truncate">{w.name}</span>
              {w.id === activeWorkspaceId && <Check size={14} className="text-fg-muted" />}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div className="absolute left-full top-0 ml-1 z-50 w-60 bg-surface border border-border rounded-card shadow-2xl p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs text-fg-secondary leading-snug">
              Há uma tarefa em execução. Parar e trocar para{" "}
              <span className="text-fg font-medium">{pending.name}</span>?
            </p>
            <button
              onClick={cancel}
              className="p-0.5 text-fg-muted hover:text-fg-secondary rounded-chip shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          <span className="block text-xs text-fg-muted mb-1.5">Marcar a tarefa como:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void confirm(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-accent/10 border border-accent/30 text-accent-text hover:bg-accent/20 rounded-control transition-colors"
            >
              <CheckCircle2 size={14} />
              Concluída
            </button>
            <button
              onClick={() => void confirm(false)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-raised border border-border text-fg-secondary hover:text-fg rounded-control transition-colors"
            >
              <Clock size={14} />
              Pendente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

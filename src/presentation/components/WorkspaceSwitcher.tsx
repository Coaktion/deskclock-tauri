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
        className={`w-full flex flex-col items-center gap-2 py-2 px-1 rounded-lg border transition-colors ${
          open ? classes.soft : "border-transparent hover:bg-gray-800/60"
        }`}
      >
        {active ? <WorkspaceDot color={active.color} size={10} /> : <Layers size={14} />}
        <span
          className={`text-xs font-medium leading-none truncate max-w-full ${
            open ? classes.text : "text-gray-500"
          }`}
        >
          {active?.name ?? "Workspace"}
        </span>
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-1 z-50 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1">
          <p className="px-3 py-1.5 text-overline uppercase text-gray-600">Workspace</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => void handlePick(w.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <WorkspaceDot color={w.color} />
              <span className="flex-1 text-left truncate">{w.name}</span>
              {w.id === activeWorkspaceId && <Check size={12} className="text-gray-500" />}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div className="absolute left-full top-0 ml-1 z-50 w-60 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs text-gray-300 leading-snug">
              Há uma tarefa em execução. Parar e trocar para{" "}
              <span className="text-gray-100 font-medium">{pending.name}</span>?
            </p>
            <button
              onClick={cancel}
              className="p-0.5 text-gray-600 hover:text-gray-400 rounded shrink-0"
            >
              <X size={13} />
            </button>
          </div>
          <span className="block text-xs text-gray-500 mb-1.5">Marcar a tarefa como:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void confirm(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              <CheckCircle2 size={12} />
              Concluída
            </button>
            <button
              onClick={() => void confirm(false)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              <Clock size={12} />
              Pendente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

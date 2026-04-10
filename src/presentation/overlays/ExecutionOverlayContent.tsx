import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, CheckCircle2, Clock, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { Task } from "@domain/entities/Task";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS } from "@shared/utils/time";

interface ExecutionOverlayContentProps {
  task: Task;
  onPause: () => void;
  onResume: () => void;
  onStop: (completed: boolean) => void;
}

export function ExecutionOverlayContent({
  task,
  onPause,
  onResume,
  onStop,
}: ExecutionOverlayContentProps) {
  const seconds = useTaskTimer(task);
  const isRunning = task.status === "running";
  const displayName = task.name ?? "(sem nome)";
  const [confirmingStop, setConfirmingStop] = useState(false);
  const didMoveRef = useRef(false);

  // Detecta se a janela foi arrastada para distinguir clique de drag
  useEffect(() => {
    const unlisten = getCurrentWindow().listen("tauri://move", () => {
      didMoveRef.current = true;
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function handleAreaClick() {
    if (didMoveRef.current) {
      didMoveRef.current = false;
      return;
    }
    const main = await WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.setFocus();
    await emit(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, {});
  }

  // Redimensiona a janela ao entrar/sair do modo de confirmação
  useEffect(() => {
    const win = getCurrentWindow();
    if (confirmingStop) {
      win.setSize(new LogicalSize(280, 96)).catch(() => {});
    } else {
      win.setSize(new LogicalSize(280, 80)).catch(() => {});
    }
  }, [confirmingStop]);

  return (
    <div
      data-tauri-drag-region
      onMouseDown={() => { didMoveRef.current = false; }}
      className={`w-full h-full flex items-center gap-2 bg-gray-900 border-l-4 rounded-lg shadow-xl px-3 ${
        task.billable ? "border-l-blue-500" : "border-l-gray-600"
      }`}
    >
      {confirmingStop ? (
        /* Confirmação inline compacta */
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 shrink-0">Concluída?</span>
          <button
            onClick={() => {
              setConfirmingStop(false);
              onStop(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors shrink-0"
          >
            <CheckCircle2 size={11} />
            Sim
          </button>
          <button
            onClick={() => {
              setConfirmingStop(false);
              onStop(false);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors shrink-0"
          >
            <Clock size={11} />
            Não
          </button>
          <button
            onClick={() => setConfirmingStop(false)}
            className="ml-auto p-1 text-gray-600 hover:text-gray-400 rounded shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <>
          {/* Área clicável (nome + timer) — drag via container externo */}
          <div
            onClick={handleAreaClick}
            className="flex-1 min-w-0 flex flex-col cursor-pointer group select-none"
            title="Abrir janela principal"
          >
            <p className="text-[11px] text-gray-400 truncate leading-tight group-hover:text-gray-200 transition-colors pointer-events-none">
              {displayName}
            </p>
            <p className="text-xl font-mono font-semibold text-gray-100 leading-tight pointer-events-none">
              {formatHHMMSS(seconds)}
            </p>
          </div>

          {/* Botões interativos */}
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={isRunning ? onPause : onResume}
              className="p-1.5 text-gray-400 hover:text-gray-100 rounded hover:bg-gray-800 transition-colors"
            >
              {isRunning ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              onClick={() => setConfirmingStop(true)}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
            >
              <Square size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, CheckCircle2, Clock, X, GripVertical } from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { Task } from "@domain/entities/Task";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS } from "@shared/utils/time";

interface ExecutionOverlayContentProps {
  task: Task;
  isHovered: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: (completed: boolean) => void;
  onCancel: () => void;
}

export function ExecutionOverlayContent({
  task,
  isHovered,
  onPause,
  onResume,
  onStop,
  onCancel,
}: ExecutionOverlayContentProps) {
  const seconds = useTaskTimer(task);
  const isRunning = task.status === "running";
  const displayName = task.name ?? "(sem nome)";
  const [confirmingStop, setConfirmingStop] = useState(false);
  const didMoveRef = useRef(false);
  const isMouseDownRef = useRef(false);

  // Detecta se a janela foi arrastada para distinguir clique de drag
  useEffect(() => {
    const handleMouseUp = () => { isMouseDownRef.current = false; };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    const unlisten = WebviewWindow.getCurrent().listen("tauri://move", () => {
      if (isMouseDownRef.current) didMoveRef.current = true;
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function handleAreaClick() {
    if (didMoveRef.current) {
      didMoveRef.current = false;
      return;
    }
    const main = await WebviewWindow.getByLabel("main");
    await emit(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, {});
    await main?.show();
    await main?.setFocus();
  }

  const gripColor = isRunning ? "text-blue-500" : "text-amber-500";
  const borderColor = task.billable ? "border-l-blue-500" : "border-l-gray-600";

  return (
    <div
      data-tauri-drag-region
      onMouseDown={() => { isMouseDownRef.current = true; didMoveRef.current = false; }}
      className={`w-full h-full flex items-center bg-gray-900 border-l-4 rounded-lg shadow-xl overflow-hidden ${borderColor}`}
    >
      {/* Grip duplo vertical */}
      <div
        data-tauri-drag-region
        className={`flex flex-col items-center justify-center px-1 h-full shrink-0 select-none ${gripColor} ${isRunning ? "animate-pulse" : ""}`}
      >
        <GripVertical size={13} className="pointer-events-none" />
        <GripVertical size={13} className="pointer-events-none" style={{ marginTop: "-2px" }} />
      </div>

      {confirmingStop ? (
        /* Confirmação de conclusão */
        <div className="flex-1 flex items-center gap-2 min-w-0 pr-2">
          <span className="text-xs text-gray-400 shrink-0">Concluída?</span>
          <button
            onClick={() => { setConfirmingStop(false); onStop(true); }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors shrink-0"
          >
            <CheckCircle2 size={11} />
            Sim
          </button>
          <button
            onClick={() => { setConfirmingStop(false); onStop(false); }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors shrink-0"
          >
            <Clock size={11} />
            Não
          </button>
          <button
            onClick={() => setConfirmingStop(false)}
            title="Retomar tarefa"
            className="ml-auto p-1 text-gray-500 hover:text-green-400 rounded shrink-0 transition-colors"
          >
            <Play size={11} />
          </button>
        </div>
      ) : (
        <>
          {/* Nome + Timer */}
          <div
            onClick={handleAreaClick}
            className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer group select-none pr-1.5 rounded px-1.5 hover:bg-gray-800 transition-colors"
            title="Abrir janela principal"
          >
            <p className="text-[10px] text-gray-400 truncate leading-none group-hover:text-gray-200 transition-colors pointer-events-none">
              {displayName}
            </p>
            <p className="text-base font-mono font-semibold text-gray-100 leading-snug pointer-events-none">
              {formatHHMMSS(seconds)}
            </p>
          </div>

          {/* Botões — visíveis apenas no hover */}
          <div
            className={`flex items-center gap-0.5 shrink-0 overflow-hidden transition-all duration-150 ease-out ${
              isHovered
                ? "max-w-[96px] px-1.5 opacity-100 pointer-events-auto"
                : "max-w-0 px-0 opacity-0 pointer-events-none"
            }`}
          >
            <button
              onClick={isRunning ? onPause : onResume}
              className="p-1.5 text-gray-400 hover:text-gray-100 rounded hover:bg-gray-800 transition-colors"
            >
              {isRunning ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              onClick={() => setConfirmingStop(true)}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
              title="Parar tarefa"
            >
              <Square size={13} />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
              title="Cancelar tarefa"
            >
              <X size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

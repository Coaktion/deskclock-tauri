import { Play, Pause, Square } from "lucide-react";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS } from "@shared/utils/time";

export function ExecutionOverlay() {
  const { runningTask, isOverlayVisible, pauseTask, resumeTask, stopTask } = useRunningTask();
  const seconds = useTaskTimer(runningTask);

  if (!runningTask || !isOverlayVisible) return null;

  const isRunning = runningTask.status === "running";
  const displayName = runningTask.name ?? "(sem nome)";

  async function handlePlayPause() {
    if (isRunning) await pauseTask();
    else await resumeTask();
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 flex items-center gap-3 bg-gray-900 border-l-4 rounded-lg shadow-xl px-4 py-3 min-w-[220px] ${
        runningTask.billable ? "border-l-blue-500" : "border-l-gray-600"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 truncate">{displayName}</p>
        <p className="text-lg font-mono text-gray-200">{formatHHMMSS(seconds)}</p>
      </div>
      <div className="flex gap-1">
        <button
          onClick={handlePlayPause}
          className="p-1.5 text-gray-400 hover:text-gray-100 rounded hover:bg-gray-800"
        >
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={() => stopTask()}
          className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800"
        >
          <Square size={16} />
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import type { Task } from "@domain/entities/Task";
import { TaskRepository } from "@infra/database/TaskRepository";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  OVERLAY_EVENTS,
  type RunningTaskChangedPayload,
  type OverlaySetModePayload,
  type OverlayConfigChangedPayload,
  type TaskStoppedPayload,
} from "@shared/types/overlayEvents";
import { snapPositionToGrid } from "@shared/utils/snapToGrid";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { ExecutionOverlayContent } from "./ExecutionOverlayContent";
import { PlanningOverlayContent } from "./PlanningOverlayContent";
import { CompactOverlayContent } from "./CompactOverlayContent";

export type OverlayMode = "execution" | "planning" | "compact";

const OVERLAY_SIZES: Record<OverlayMode, { width: number; height: number }> = {
  execution: { width: 280, height: 80 },
  planning: { width: 288, height: 142 }, // altura real calculada em PlanningOverlayContent
  compact: { width: 52, height: 52 },
};

const taskRepo = new TaskRepository();
const appWindow = getCurrentWindow();

function OverlayAppInner() {
  const config = useAppConfig();
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [mode, setMode] = useState<OverlayMode>("compact");
  const [isHovered, setIsHovered] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // switchMode definido antes dos effects que dependem dele
  const switchMode = useCallback(
    async (newMode: OverlayMode) => {
      const { width, height } = OVERLAY_SIZES[newMode];
      await appWindow.setSize(new LogicalSize(width, height));

      const key = `overlayPosition_${newMode}` as Parameters<typeof config.get>[0];
      const saved = config.get(key) as { x: number; y: number };
      if (saved && saved.x >= 0 && saved.y >= 0) {
        await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
      }
      setMode(newMode);
    },
    [config]
  );

  // Aplica tamanho de fonte e tema ao iniciar
  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega task inicial, define modo e sincroniza opacidade
  useEffect(() => {
    if (!config.isLoaded) return;
    getActiveTasks(taskRepo).then((tasks) => {
      const running = tasks.find((t) => t.status === "running") ?? tasks[0] ?? null;
      setRunningTask(running);
      setMode(running ? "execution" : "planning");
    });
    setOverlayOpacity(config.get("overlayOpacity") as number);
    setSnapToGrid(!!config.get("overlaySnapToGrid"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza opacidade em tempo real quando o setting muda
  useEffect(() => {
    const unlisten = listen<OverlayConfigChangedPayload>(
      OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED,
      ({ payload }) => {
        if (payload.key === "overlayOpacity") {
          setOverlayOpacity(payload.value as number);
        } else if (payload.key === "overlaySnapToGrid") {
          setSnapToGrid(!!payload.value);
        } else if (payload.key === "fontSize") {
          applyFontSize(payload.value as string);
        } else if (payload.key === "theme") {
          applyTheme(payload.value as Theme);
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Muda modo quando solicitado pelo main window (ex: após fechar welcome)
  useEffect(() => {
    const unlisten = listen<OverlaySetModePayload>(
      OVERLAY_EVENTS.OVERLAY_SET_MODE,
      ({ payload }) => {
        switchMode(payload.mode);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [switchMode]);

  // Restaura posição salva ao montar
  useEffect(() => {
    if (!config.isLoaded) return;
    const key = `overlayPosition_${mode}` as const;
    const saved = config.get(key as Parameters<typeof config.get>[0]);
    const pos = saved as { x: number; y: number };
    if (pos && pos.x >= 0 && pos.y >= 0) {
      appWindow.setPosition(new PhysicalPosition(pos.x, pos.y));
    }
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ouve eventos de mudança de tarefa vindos do main window
  useEffect(() => {
    const unlisten = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      ({ payload }) => {
        if (payload.source === "overlay") return;
        setRunningTask(payload.task);
        if (payload.task) {
          switchMode("execution");
        } else {
          setMode((prev) => (prev === "compact" ? "compact" : "planning"));
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Snap-to-grid + persistência de posição no evento tauri://move
  useEffect(() => {
    const unlisten = appWindow.listen<{ x: number; y: number }>("tauri://move", ({ payload }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const { x: rawX, y: rawY } = payload;
      const snapped = snapToGrid ? snapPositionToGrid(rawX, rawY) : { x: rawX, y: rawY };

      debounceRef.current = setTimeout(async () => {
        if (snapToGrid) {
          await appWindow.setPosition(new PhysicalPosition(snapped.x, snapped.y));
        }
        const key = `overlayPosition_${mode}` as Parameters<typeof config.set>[0];
        await config.set(key, snapped as never);
      }, 200);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, mode, snapToGrid]);

  const handlePause = useCallback(async () => {
    if (!runningTask) return;
    const updated = await pauseTaskUC(taskRepo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
      task: updated,
      source: "overlay",
    } satisfies RunningTaskChangedPayload);
  }, [runningTask]);

  const handleResume = useCallback(async () => {
    if (!runningTask) return;
    const updated = await resumeTaskUC(taskRepo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
      task: updated,
      source: "overlay",
    } satisfies RunningTaskChangedPayload);
  }, [runningTask]);

  const handleStop = useCallback(
    async (completed: boolean) => {
      if (!runningTask) return;
      const stoppedTask = await stopTaskUC(taskRepo, runningTask.id, new Date().toISOString());
      setRunningTask(null);
      await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
        task: null,
        source: "overlay",
      } satisfies RunningTaskChangedPayload);
      await emit(OVERLAY_EVENTS.TASK_STOPPED, {
        task: stoppedTask,
        completed,
      } satisfies TaskStoppedPayload);
      await switchMode("planning");
    },
    [runningTask, switchMode]
  );

  const handleStartTask = useCallback(
    async (input: {
      name?: string | null;
      projectId?: string | null;
      categoryId?: string | null;
      billable: boolean;
    }) => {
      const task = await startTaskUC(taskRepo, input, new Date().toISOString());
      setRunningTask(task);
      await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
        task,
        source: "overlay",
      } satisfies RunningTaskChangedPayload);
      await switchMode("execution");
    },
    [switchMode]
  );

  const handleNavigatePlanning = useCallback(async () => {
    await emit(OVERLAY_EVENTS.OVERLAY_NAVIGATE_PLANNING, {});
    await appWindow.hide();
  }, []);

  const opacity = isHovered ? 1 : overlayOpacity / 100;

  return (
    <div
      className="w-screen h-screen overflow-hidden"
      style={{ opacity, transition: "opacity 0.2s ease" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {mode === "execution" && runningTask && (
        <ExecutionOverlayContent
          task={runningTask}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
        />
      )}
      {mode === "planning" && (
        <PlanningOverlayContent
          onMinimize={() => switchMode("compact")}
          onClose={() => appWindow.hide()}
          onNavigatePlanning={handleNavigatePlanning}
          onStartTask={handleStartTask}
          onTaskStarted={(task) => {
            setRunningTask(task);
            switchMode("execution");
          }}
        />
      )}
      {mode === "compact" && (
        <CompactOverlayContent
          onExpand={() => switchMode("planning")}
          onStartTask={handleStartTask}
        />
      )}
    </div>
  );
}

export function OverlayApp() {
  return (
    <ConfigProvider>
      <OverlayAppInner />
    </ConfigProvider>
  );
}

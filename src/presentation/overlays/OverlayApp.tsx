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
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  OVERLAY_EVENTS,
  type RunningTaskChangedPayload,
  type OverlaySetModePayload,
  type OverlayConfigChangedPayload,
  type TaskStoppedPayload,
} from "@shared/types/overlayEvents";
import { snapPositionToGrid } from "@shared/utils/snapToGrid";
import { currentMonitor } from "@tauri-apps/api/window";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { ExecutionOverlayContent } from "./ExecutionOverlayContent";
import { PlanningOverlayContent } from "./PlanningOverlayContent";
import { CompactOverlayContent } from "./CompactOverlayContent";

export type OverlayMode = "execution" | "planning" | "compact";

const OVERLAY_SIZES: Record<OverlayMode, { width: number; height: number }> = {
  execution: { width: 220, height: 40 },
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
  const [activePlannedTaskId, setActivePlannedTaskId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRawPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modeRef = useRef<OverlayMode>("compact");
  const isStartingTaskRef = useRef(false);
  // Tamanho intencionado e flag para ignorar eventos de resize que nós mesmos causamos
  const intendedSizeRef = useRef(OVERLAY_SIZES.compact);
  const isProgrammaticResizeRef = useRef(false);
  // Prevents startup effect from overriding mode set via OVERLAY_SET_MODE event
  const modeSetByEventRef = useRef(false);

  // Mantém modeRef sincronizado para uso em closures com dep vazia
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Centraliza todos os setSize: limpa constraints, redimensiona e trava via min/max.
  // Mantém resizable:true (evita quebra de eventos de mouse no GTK/Linux em janelas pequenas).
  const programmaticSetSize = useCallback(async (width: number, height: number) => {
    intendedSizeRef.current = { width, height };
    isProgrammaticResizeRef.current = true;
    await appWindow.setMinSize(null);
    await appWindow.setMaxSize(null);
    await appWindow.setSize(new LogicalSize(width, height));
    await appWindow.setMinSize(new LogicalSize(width, height));
    await appWindow.setMaxSize(new LogicalSize(width, height));
    setTimeout(() => { isProgrammaticResizeRef.current = false; }, 80);
  }, []);

  // switchMode definido antes dos effects que dependem dele
  const switchMode = useCallback(
    async (newMode: OverlayMode) => {
      const { width, height } = OVERLAY_SIZES[newMode];
      await programmaticSetSize(width, height);

      const key = `overlayPosition_${newMode}` as Parameters<typeof config.get>[0];
      const saved = config.get(key) as { x: number; y: number };
      if (saved && saved.x >= 0 && saved.y >= 0) {
        const pos = new PhysicalPosition(saved.x, saved.y);
        // Tentativa imediata + retry após 150ms: no Linux/GTK, setPosition pode falhar
        // silenciosamente em janelas ainda não realizadas pelo compositor.
        await appWindow.setPosition(pos).catch(() => {});
        setTimeout(() => appWindow.setPosition(pos).catch(() => {}), 150);
      }
      setMode(newMode);
    },
    [config, programmaticSetSize]
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
      if (running) {
        void switchMode("execution");
      } else if (!modeSetByEventRef.current) {
        // Default compact; planning is signalled by App.tsx via OVERLAY_SET_MODE for normal startup
        void switchMode("compact");
      }
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

  // Muda modo quando solicitado pelo main window
  useEffect(() => {
    const unlisten = listen<OverlaySetModePayload>(
      OVERLAY_EVENTS.OVERLAY_SET_MODE,
      ({ payload }) => {
        modeSetByEventRef.current = true;
        void switchMode(payload.mode);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [switchMode]);

  // Ouve eventos de mudança de tarefa vindos do main window
  useEffect(() => {
    const unlisten = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      ({ payload }) => {
        if (payload.source === "overlay") return;
        setRunningTask(payload.task);
        if (payload.task) {
          void switchMode("execution");
          if (config.get("overlayShowOnStart")) {
            void appWindow.show();
          }
        } else {
          if (config.get("overlayAlwaysVisible")) {
            // Usa modeRef para ler o modo atual sem depender de closure estale
            void switchMode(modeRef.current === "compact" ? "compact" : "planning");
          } else {
            void appWindow.hide();
          }
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [switchMode, config]);

  // Snap-to-grid + clamp ao monitor + persistência de posição
  // Acumula posição em lastRawPosRef e aplica apenas no debounce final,
  // evitando pulos durante o arraste quando snap-to-grid está ativo.
  useEffect(() => {
    const unlisten = appWindow.listen<{ x: number; y: number }>("tauri://move", ({ payload }) => {
      lastRawPosRef.current = { x: payload.x, y: payload.y };
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        const { x: rawX, y: rawY } = lastRawPosRef.current;

        // Clamp: garante que a janela não saia da área do monitor.
        // Usa outerSize() para obter o tamanho físico real — funciona em
        // todos os modos.
        let finalX = rawX;
        let finalY = rawY;
        const [monitor, winSize] = await Promise.all([currentMonitor(), appWindow.outerSize()]);
        if (monitor) {
          const { width: mW, height: mH } = monitor.size;
          const { x: mX, y: mY } = monitor.position;
          finalX = Math.max(mX, Math.min(rawX, mX + mW - winSize.width));
          finalY = Math.max(mY, Math.min(rawY, mY + mH - winSize.height));
        }

        // Aplica snap apenas depois de todos os ajustes
        const snapped = snapToGrid ? snapPositionToGrid(finalX, finalY) : { x: finalX, y: finalY };

        if (snapToGrid || finalX !== rawX || finalY !== rawY) {
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

  // Trava resize manual: restaura tamanho intencionado se o usuário redimensionar
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://resize", () => {
      if (isProgrammaticResizeRef.current) return;
      const { width, height } = intendedSizeRef.current;
      void programmaticSetSize(width, height);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [programmaticSetSize]);

  // Callback para PlanningOverlayContent informar seu tamanho dinâmico
  const handlePlanningResize = useCallback((width: number, height: number) => {
    void programmaticSetSize(width, height);
  }, [programmaticSetSize]);

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

  const handleCancel = useCallback(async () => {
    if (!runningTask) return;
    await cancelTaskUC(taskRepo, runningTask.id);
    setRunningTask(null);
    setActivePlannedTaskId(null);
    await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
      task: null,
      source: "overlay",
    } satisfies RunningTaskChangedPayload);
    await switchMode("compact");
  }, [runningTask, switchMode]);

  const handleStop = useCallback(
    async (completed: boolean) => {
      if (!runningTask) return;
      const stoppedTask = await stopTaskUC(taskRepo, runningTask.id, new Date().toISOString());
      const plannedTaskId = activePlannedTaskId;
      setRunningTask(null);
      setActivePlannedTaskId(null);
      await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
        task: null,
        source: "overlay",
      } satisfies RunningTaskChangedPayload);
      await emit(OVERLAY_EVENTS.TASK_STOPPED, {
        task: stoppedTask,
        completed,
        plannedTaskId,
      } satisfies TaskStoppedPayload);
      await switchMode("planning");
    },
    [runningTask, activePlannedTaskId, switchMode]
  );

  const handleStartTask = useCallback(
    async (input: {
      name?: string | null;
      projectId?: string | null;
      categoryId?: string | null;
      billable: boolean;
      plannedTaskId?: string | null;
    }) => {
      if (isStartingTaskRef.current) return;
      isStartingTaskRef.current = true;
      try {
        const task = await startTaskUC(taskRepo, input, new Date().toISOString());
        setRunningTask(task);
        setActivePlannedTaskId(input.plannedTaskId ?? null);
        await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
          task,
          source: "overlay",
          plannedTaskId: input.plannedTaskId ?? null,
        } satisfies RunningTaskChangedPayload);
        await switchMode("execution");
      } finally {
        isStartingTaskRef.current = false;
      }
    },
    [switchMode]
  );

  const handleNavigatePlanning = useCallback(async () => {
    await emit(OVERLAY_EVENTS.OVERLAY_NAVIGATE_PLANNING, {});
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
          isHovered={isHovered}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onCancel={handleCancel}
        />
      )}
      {mode === "planning" && (
        <PlanningOverlayContent
          onMinimize={() => switchMode("compact")}
          onClose={() => appWindow.hide()}
          onNavigatePlanning={handleNavigatePlanning}
          onResize={handlePlanningResize}
          onStartTask={handleStartTask}
          onTaskStarted={(task) => {
            setRunningTask(task);
            switchMode("execution");
          }}
          runningTask={runningTask}
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

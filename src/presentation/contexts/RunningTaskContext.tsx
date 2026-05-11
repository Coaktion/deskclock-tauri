import type { Task } from "@domain/entities/Task";
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { usePostStopLogic } from "@presentation/hooks/usePostStopLogic";
import { useOverlaySync } from "@presentation/hooks/useOverlaySync";
import { useTraySync } from "@presentation/hooks/useTraySync";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type RunningTaskChangedPayload } from "@shared/types/overlayEvents";
import { emit } from "@tauri-apps/api/event";
import { createContext, useCallback, useEffect, useRef, useState } from "react";

interface StartInput {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable: boolean;
  startTime?: string;
  plannedTaskId?: string | null;
}

interface UpdateInput {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable?: boolean;
  startTime?: string;
}

export interface RunningTaskContextValue {
  runningTask: Task | null;
  reloadSignal: number;
  startTask: (input: StartInput) => Promise<void>;
  pauseTask: () => Promise<void>;
  resumeTask: () => Promise<void>;
  stopTask: (completed: boolean) => Promise<void>;
  cancelTask: () => Promise<void>;
  updateActiveTask: (input: UpdateInput) => Promise<void>;
}

export const RunningTaskContext = createContext<RunningTaskContextValue | null>(null);


async function notifyOverlay(task: Task | null) {
  await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
    task,
    source: "main",
  } satisfies RunningTaskChangedPayload);
}

interface RunningTaskProviderProps {
  children: React.ReactNode;
  config: ConfigContextValue;
}

export function RunningTaskProvider({ children, config }: RunningTaskProviderProps) {
  const { taskRepo } = useRepositories();
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [activePlannedTaskId, setActivePlannedTaskId] = useState<string | null>(null);
  const mounted = useRef(true);
  const isStartingTaskRef = useRef(false);

  const triggerReload = useCallback(() => setReloadSignal((s) => s + 1), []);
  const { applyStopRules } = usePostStopLogic(config, triggerReload);

  useEffect(() => {
    mounted.current = true;
    getActiveTasks(taskRepo).then((tasks) => {
      if (!mounted.current) return;
      const running = tasks.find((t) => t.status === "running");
      const active = running ?? tasks[0] ?? null;
      setRunningTask(active);
    });
    return () => {
      mounted.current = false;
    };
  }, [taskRepo]);

  useOverlaySync({
    onTaskChanged: (task, plannedTaskId) => {
      setRunningTask(task);
      setActivePlannedTaskId(task ? (plannedTaskId ?? null) : null);
      triggerReload();
    },
    onTaskStopped: (task, plannedTaskId, completed) => {
      applyStopRules(task, plannedTaskId, completed);
    },
  });

  useTraySync(runningTask?.status);

  const startTask = useCallback(
    async (input: StartInput) => {
      if (runningTask) return;
      if (isStartingTaskRef.current) return;
      isStartingTaskRef.current = true;
      try {
        const task = await startTaskUC(taskRepo, input, new Date().toISOString());
        setRunningTask(task);
        setActivePlannedTaskId(input.plannedTaskId ?? null);
        triggerReload();
        await notifyOverlay(task);
      } finally {
        isStartingTaskRef.current = false;
      }
    },
    [taskRepo, runningTask, triggerReload]
  );

  const pauseTask = useCallback(async () => {
    if (!runningTask) return;
    const updated = await pauseTaskUC(taskRepo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await notifyOverlay(updated);
  }, [taskRepo, runningTask]);

  const resumeTask = useCallback(async () => {
    if (!runningTask) return;
    const updated = await resumeTaskUC(taskRepo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await notifyOverlay(updated);
  }, [taskRepo, runningTask]);

  const stopTask = useCallback(
    async (completed: boolean) => {
      if (!runningTask) return;
      const stoppedTask = await stopTaskUC(taskRepo, runningTask.id, new Date().toISOString());
      const plannedId = activePlannedTaskId;
      setRunningTask(null);
      setActivePlannedTaskId(null);
      triggerReload();
      await notifyOverlay(null);
      await applyStopRules(stoppedTask, plannedId, completed);
    },
    [taskRepo, runningTask, activePlannedTaskId, triggerReload, applyStopRules]
  );

  const cancelTask = useCallback(async () => {
    if (!runningTask) return;
    await cancelTaskUC(taskRepo, runningTask.id);
    setRunningTask(null);
    setActivePlannedTaskId(null);
    triggerReload();
    await notifyOverlay(null);
  }, [taskRepo, runningTask, triggerReload]);

  const updateActiveTask = useCallback(
    async (input: UpdateInput) => {
      if (!runningTask) return;
      const updated = await updateTaskUC(taskRepo, runningTask.id, input, new Date().toISOString());
      setRunningTask(updated);
      await notifyOverlay(updated);
    },
    [taskRepo, runningTask]
  );

  return (
    <RunningTaskContext.Provider
      value={{
        runningTask,
        reloadSignal,
        startTask,
        pauseTask,
        resumeTask,
        stopTask,
        cancelTask,
        updateActiveTask,
      }}
    >
      {children}
    </RunningTaskContext.Provider>
  );
}

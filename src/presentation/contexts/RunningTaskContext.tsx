import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { Task } from "@domain/entities/Task";
import { TaskRepository } from "@infra/database/TaskRepository";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";

interface StartInput {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable: boolean;
  startTime?: string;
}

interface UpdateInput {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable?: boolean;
  startTime?: string;
}

interface RunningTaskContextValue {
  runningTask: Task | null;
  isOverlayVisible: boolean;
  reloadSignal: number;
  startTask: (input: StartInput) => Promise<void>;
  pauseTask: () => Promise<void>;
  resumeTask: () => Promise<void>;
  stopTask: () => Promise<void>;
  cancelTask: () => Promise<void>;
  updateActiveTask: (input: UpdateInput) => Promise<void>;
  setOverlayVisible: (v: boolean) => void;
}

const RunningTaskContext = createContext<RunningTaskContextValue | null>(null);

const repo = new TaskRepository();

export function RunningTaskProvider({ children }: { children: React.ReactNode }) {
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [reloadSignal, setReloadSignal] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getActiveTasks(repo).then((tasks) => {
      if (!mounted.current) return;
      const running = tasks.find((t) => t.status === "running");
      const active = running ?? tasks[0] ?? null;
      setRunningTask(active);
      if (active) setIsOverlayVisible(true);
    });
    return () => { mounted.current = false; };
  }, []);

  const triggerReload = useCallback(() => setReloadSignal((s) => s + 1), []);

  const startTask = useCallback(async (input: StartInput) => {
    const task = await startTaskUC(repo, input, new Date().toISOString());
    setRunningTask(task);
    setIsOverlayVisible(true);
    triggerReload();
  }, [triggerReload]);

  const pauseTask = useCallback(async () => {
    if (!runningTask) return;
    const updated = await pauseTaskUC(repo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
  }, [runningTask]);

  const resumeTask = useCallback(async () => {
    if (!runningTask) return;
    const updated = await resumeTaskUC(repo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
  }, [runningTask]);

  const stopTask = useCallback(async () => {
    if (!runningTask) return;
    await stopTaskUC(repo, runningTask.id, new Date().toISOString());
    setRunningTask(null);
    setIsOverlayVisible(false);
    triggerReload();
  }, [runningTask, triggerReload]);

  const cancelTask = useCallback(async () => {
    if (!runningTask) return;
    await cancelTaskUC(repo, runningTask.id);
    setRunningTask(null);
    setIsOverlayVisible(false);
    triggerReload();
  }, [runningTask, triggerReload]);

  const updateActiveTask = useCallback(async (input: UpdateInput) => {
    if (!runningTask) return;
    const updated = await updateTaskUC(repo, runningTask.id, input, new Date().toISOString());
    setRunningTask(updated);
  }, [runningTask]);

  return (
    <RunningTaskContext.Provider value={{
      runningTask, isOverlayVisible, reloadSignal,
      startTask, pauseTask, resumeTask, stopTask, cancelTask, updateActiveTask,
      setOverlayVisible: setIsOverlayVisible,
    }}>
      {children}
    </RunningTaskContext.Provider>
  );
}

export function useRunningTask(): RunningTaskContextValue {
  const ctx = useContext(RunningTaskContext);
  if (!ctx) throw new Error("useRunningTask must be inside RunningTaskProvider");
  return ctx;
}

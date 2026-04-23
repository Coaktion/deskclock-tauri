import type { Task } from "@domain/entities/Task";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { TaskRepository } from "@infra/database/TaskRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import {
  OVERLAY_EVENTS,
  type RunningTaskChangedPayload,
  type TaskStoppedPayload,
} from "@shared/types/overlayEvents";
import { todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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

interface RunningTaskContextValue {
  runningTask: Task | null;
  reloadSignal: number;
  startTask: (input: StartInput) => Promise<void>;
  pauseTask: () => Promise<void>;
  resumeTask: () => Promise<void>;
  stopTask: (completed: boolean) => Promise<void>;
  cancelTask: () => Promise<void>;
  updateActiveTask: (input: UpdateInput) => Promise<void>;
}

const RunningTaskContext = createContext<RunningTaskContextValue | null>(null);

const repo = new TaskRepository();
const plannedRepo = new PlannedTaskRepository();
const logRepo = new TaskIntegrationLogRepository();

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
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [activePlannedTaskId, setActivePlannedTaskId] = useState<string | null>(null);
  const mounted = useRef(true);
  const isStartingTaskRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    getActiveTasks(repo).then((tasks) => {
      if (!mounted.current) return;
      const running = tasks.find((t) => t.status === "running");
      const active = running ?? tasks[0] ?? null;
      setRunningTask(active);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  // Ouve ações vindas do overlay (pause, resume, stop iniciados lá)
  useEffect(() => {
    const unlisten = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      ({ payload }) => {
        if (payload.source !== "overlay") return;
        setRunningTask(payload.task);
        if (payload.task) {
          setActivePlannedTaskId(payload.plannedTaskId ?? null);
        } else {
          setActivePlannedTaskId(null);
        }
        triggerReload();
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerReload = useCallback(() => setReloadSignal((s) => s + 1), []);

  // Sincroniza o status da tarefa com o ícone da bandeja (tray icon)
  useEffect(() => {
    const status = runningTask?.status ?? "idle";
    invoke("update_tray_icon", { status }).catch(console.error);
  }, [runningTask?.status]);

  const startTask = useCallback(
    async (input: StartInput) => {
      if (runningTask) return;
      if (isStartingTaskRef.current) return;
      isStartingTaskRef.current = true;
      try {
        const task = await startTaskUC(repo, input, new Date().toISOString());
        setRunningTask(task);
        setActivePlannedTaskId(input.plannedTaskId ?? null);
        triggerReload();
        await notifyOverlay(task);
      } finally {
        isStartingTaskRef.current = false;
      }
    },
    [runningTask, triggerReload]
  );

  const pauseTask = useCallback(async () => {
    if (!runningTask) return;
    const updated = await pauseTaskUC(repo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await notifyOverlay(updated);
  }, [runningTask]);

  const resumeTask = useCallback(async () => {
    if (!runningTask) return;
    const updated = await resumeTaskUC(repo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await notifyOverlay(updated);
  }, [runningTask]);

  const autoSyncTask = useCallback(
    async (stoppedTask: Task) => {
      if (!config.isLoaded) return;
      if (!config.get("integrationGoogleSheetsAutoSync")) return;
      if (config.get("sheetsAutoSyncMode") !== "per-task") return;
      const spreadsheetId = config.get("integrationGoogleSheetsSpreadsheetId");
      const refreshToken = config.get("googleRefreshToken");
      if (!spreadsheetId || !refreshToken) return;

      try {
        const [projects, categories] = await Promise.all([
          new ProjectRepository().findAll(),
          new CategoryRepository().findAll(),
        ]);
        const sender = new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories);
        await sender.send([stoppedTask]);
        await logRepo.markSent([stoppedTask.id], "google_sheets");
        triggerReload();
        await showToast("success", "Tarefa enviada para o Google Sheets");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao enviar para o Sheets.";
        await showToast("error", msg);
      }
    },
    [config, triggerReload]
  );

  const completePlannedIfNeeded = useCallback(async (plannedTaskId: string | null | undefined) => {
    if (!plannedTaskId) return;
    await completePlannedTask(plannedRepo, plannedTaskId, todayISO());
    await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
  }, []);

  // Ouve confirmação de stop vinda do overlay para auto-sync e conclusão de planned task
  useEffect(() => {
    const unlisten = listen<TaskStoppedPayload>(
      OVERLAY_EVENTS.TASK_STOPPED,
      async ({ payload }) => {
        if (!payload.completed) return;
        const duration = payload.task.durationSeconds ?? 0;
        if (config.get("discardTasksUnderOneMinute") && duration < 60) {
          await cancelTaskUC(repo, payload.task.id);
          triggerReload();
          await showToast("info", "Tarefa descartada (menos de 1 minuto)");
          return;
        }
        await completePlannedIfNeeded(payload.plannedTaskId);
        await autoSyncTask(payload.task);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [autoSyncTask, completePlannedIfNeeded, config, triggerReload]);

  const stopTask = useCallback(
    async (completed: boolean) => {
      if (!runningTask) return;
      const stoppedTask = await stopTaskUC(repo, runningTask.id, new Date().toISOString());
      const duration = stoppedTask.durationSeconds ?? 0;
      const plannedId = activePlannedTaskId;
      if (config.get("discardTasksUnderOneMinute") && duration < 60) {
        await cancelTaskUC(repo, stoppedTask.id);
        setRunningTask(null);
        setActivePlannedTaskId(null);
        triggerReload();
        await notifyOverlay(null);
        await showToast("info", "Tarefa descartada (menos de 1 minuto)");
        return;
      }
      setRunningTask(null);
      setActivePlannedTaskId(null);
      triggerReload();
      await notifyOverlay(null);
      if (completed) {
        await completePlannedIfNeeded(plannedId);
        await autoSyncTask(stoppedTask);
      }
    },
    [runningTask, activePlannedTaskId, triggerReload, completePlannedIfNeeded, autoSyncTask, config]
  );

  const cancelTask = useCallback(async () => {
    if (!runningTask) return;
    await cancelTaskUC(repo, runningTask.id);
    setRunningTask(null);
    setActivePlannedTaskId(null);
    triggerReload();
    await notifyOverlay(null);
  }, [runningTask, triggerReload]);

  const updateActiveTask = useCallback(
    async (input: UpdateInput) => {
      if (!runningTask) return;
      const updated = await updateTaskUC(repo, runningTask.id, input, new Date().toISOString());
      setRunningTask(updated);
      await notifyOverlay(updated);
    },
    [runningTask]
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

export function useRunningTask(): RunningTaskContextValue {
  const ctx = useContext(RunningTaskContext);
  if (!ctx) throw new Error("useRunningTask must be inside RunningTaskProvider");
  return ctx;
}

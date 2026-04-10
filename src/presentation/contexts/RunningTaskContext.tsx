import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Task } from "@domain/entities/Task";
import { TaskRepository } from "@infra/database/TaskRepository";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";
import {
  OVERLAY_EVENTS,
  type RunningTaskChangedPayload,
  type TaskStoppedPayload,
} from "@shared/types/overlayEvents";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { showToast } from "@shared/utils/toast";

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

async function getOverlayWindow() {
  return WebviewWindow.getByLabel("overlay");
}

async function showOverlay() {
  const overlay = await getOverlayWindow();
  await overlay?.show();
}

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
  const mounted = useRef(true);

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
        triggerReload();
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerReload = useCallback(() => setReloadSignal((s) => s + 1), []);

  const startTask = useCallback(
    async (input: StartInput) => {
      const task = await startTaskUC(repo, input, new Date().toISOString());
      setRunningTask(task);
      triggerReload();
      await notifyOverlay(task);
      await showOverlay();
    },
    [triggerReload]
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
        await repo.markSentToSheets([stoppedTask.id]);
        triggerReload();
        await showToast("success", "Tarefa enviada para o Google Sheets");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao enviar para o Sheets.";
        await showToast("error", msg);
      }
    },
    [config, triggerReload]
  );

  // Ouve confirmação de stop vinda do overlay para auto-sync
  useEffect(() => {
    const unlisten = listen<TaskStoppedPayload>(
      OVERLAY_EVENTS.TASK_STOPPED,
      async ({ payload }) => {
        if (payload.completed) {
          await autoSyncTask(payload.task);
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [autoSyncTask]);

  const stopTask = useCallback(
    async (completed: boolean) => {
      if (!runningTask) return;
      const stoppedTask = await stopTaskUC(repo, runningTask.id, new Date().toISOString());
      setRunningTask(null);
      triggerReload();
      await notifyOverlay(null);
      if (completed) {
        await autoSyncTask(stoppedTask);
      }
    },
    [runningTask, triggerReload, autoSyncTask]
  );

  const cancelTask = useCallback(async () => {
    if (!runningTask) return;
    await cancelTaskUC(repo, runningTask.id);
    setRunningTask(null);
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

import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";
import { applyRunningTaskEditToPlanned } from "@domain/usecases/plannedTasks/ApplyRunningTaskEditToPlanned";
import { resolveActivePlannedLink } from "@domain/utils/plannedLink";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
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
  /** Quem inicia a partir de uma tarefa existente (planejada, entrada de hoje,
   *  sugestão do omnibox) precisa repassá-los: eles entram na chave de
   *  agrupamento (§6.3) e omiti-los criaria um grupo à parte. */
  customValues?: CustomValues;
}

interface UpdateInput {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable?: boolean;
  startTime?: string;
  customValues?: CustomValues;
}

export interface RunningTaskContextValue {
  runningTask: Task | null;
  reloadSignal: number;
  activePlannedTaskId: string | null;
  startTask: (input: StartInput) => Promise<void>;
  /**
   * Encerra a tarefa atual (se houver, como concluída, aplicando as regras de
   * pós-parada) e inicia uma nova. Usado pelo rastreamento de reuniões, onde a
   * troca é intencional — diferente de startTask, que é no-op quando há tarefa
   * em execução. Retorna a nova tarefa.
   */
  switchToTask: (input: StartInput) => Promise<Task | null>;
  pauseTask: () => Promise<void>;
  resumeTask: () => Promise<void>;
  stopTask: (completed: boolean, endTimeISO?: string) => Promise<void>;
  cancelTask: () => Promise<void>;
  updateActiveTask: (input: UpdateInput) => Promise<void>;
}

export const RunningTaskContext = createContext<RunningTaskContextValue | null>(null);

// plannedTaskId omitido (undefined) significa "não altere a referência do overlay" —
// usado por pause/resume/stop/cancel, que não mudam a tarefa planejada de origem.
async function notifyOverlay(task: Task | null, plannedTaskId?: string | null) {
  const payload: RunningTaskChangedPayload = { task, source: "main" };
  if (plannedTaskId !== undefined) payload.plannedTaskId = plannedTaskId;
  await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, payload);
}

interface RunningTaskProviderProps {
  children: React.ReactNode;
  config: ConfigContextValue;
}

export function RunningTaskProvider({ children, config }: RunningTaskProviderProps) {
  const { taskRepo, plannedTaskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
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
      // Restaura a planejada de origem: sem isso, parar a tarefa depois de
      // reabrir o app não a marcava como concluída no dia (applyStopRules
      // recebia null) e ela voltava a aparecer pendente.
      setActivePlannedTaskId(active?.plannedTaskId ?? null);
    });
    return () => {
      mounted.current = false;
    };
  }, [taskRepo]);

  useOverlaySync({
    onTaskChanged: (task, plannedTaskId) => {
      setRunningTask(task);
      setActivePlannedTaskId((current) => resolveActivePlannedLink(current, task, plannedTaskId));
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
        const task = await startTaskUC(
          taskRepo,
          { ...input, workspaceId },
          new Date().toISOString()
        );
        setRunningTask(task);
        setActivePlannedTaskId(input.plannedTaskId ?? null);
        triggerReload();
        await notifyOverlay(task, input.plannedTaskId ?? null);
      } finally {
        isStartingTaskRef.current = false;
      }
    },
    [taskRepo, runningTask, triggerReload, workspaceId]
  );

  const switchToTask = useCallback(
    async (input: StartInput): Promise<Task | null> => {
      if (isStartingTaskRef.current) return null;
      isStartingTaskRef.current = true;
      try {
        const nowISO = new Date().toISOString();
        if (runningTask) {
          const stopped = await stopTaskUC(taskRepo, runningTask.id, nowISO, nowISO);
          await applyStopRules(stopped, activePlannedTaskId, true);
        }
        const task = await startTaskUC(taskRepo, { ...input, workspaceId }, nowISO);
        setRunningTask(task);
        setActivePlannedTaskId(input.plannedTaskId ?? null);
        triggerReload();
        await notifyOverlay(task, input.plannedTaskId ?? null);
        return task;
      } finally {
        isStartingTaskRef.current = false;
      }
    },
    [taskRepo, runningTask, activePlannedTaskId, triggerReload, applyStopRules, workspaceId]
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
    async (completed: boolean, endTimeISO?: string) => {
      if (!runningTask) return;
      const nowISO = new Date().toISOString();
      const stoppedTask = await stopTaskUC(taskRepo, runningTask.id, endTimeISO ?? nowISO, nowISO);
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
      await notifyOverlay(updated, activePlannedTaskId);
      // O vínculo também leva a edição de volta: configurar a tarefa depois de
      // iniciá-la deixa a planejada configurada para a próxima ocorrência. O
      // fallback na própria tarefa é o mesmo de `usePostStopLogic` (§4.1) — o
      // vínculo gravado é imutável e é a verdade quando ninguém o repassou.
      const plannedId = activePlannedTaskId ?? updated.plannedTaskId;
      if (!plannedId) return;
      const planned = await applyRunningTaskEditToPlanned(plannedTaskRepo, plannedId, input);
      if (planned) await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
    },
    [taskRepo, plannedTaskRepo, runningTask, activePlannedTaskId]
  );

  return (
    <RunningTaskContext.Provider
      value={{
        runningTask,
        reloadSignal,
        activePlannedTaskId,
        startTask,
        switchToTask,
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

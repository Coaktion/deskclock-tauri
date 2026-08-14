import { useCallback, useEffect, useRef, useState } from "react";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { RepositoriesProvider, useRepositories } from "@presentation/contexts/RepositoriesContext";
import { WorkspaceProvider, useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { startTask as startTaskUC } from "@domain/usecases/tasks/StartTask";
import { pauseTask as pauseTaskUC } from "@domain/usecases/tasks/PauseTask";
import { resumeTask as resumeTaskUC } from "@domain/usecases/tasks/ResumeTask";
import { stopTask as stopTaskUC } from "@domain/usecases/tasks/StopTask";
import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";
import { applyRunningTaskEditToPlanned } from "@domain/usecases/plannedTasks/ApplyRunningTaskEditToPlanned";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  OVERLAY_EVENTS,
  type RunningTaskChangedPayload,
  type OverlayConfigChangedPayload,
  type TaskStoppedPayload,
} from "@shared/types/overlayEvents";
import { useAppearanceSync } from "@presentation/hooks/useAppearanceSync";
import { positionPopupNearCompact, POPUP_SIZE } from "@shared/utils/windowPosition";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import { PopupOverlayContent } from "./PopupOverlayContent";
import { MeetingPromptView } from "./MeetingPromptView";
import { useMeetingPrompt } from "./useMeetingPrompt";

const POPUP_W = POPUP_SIZE.width;
// A altura do popup em todo estado, e por isso também o teto do `setMaxSize`:
// enquanto ela foi estimativa, o running com ações e campos pedia mais do que o
// teto e o excedente era cortado calado.
const POPUP_H = POPUP_SIZE.height;

const appWindow = getCurrentWindow();

function PopupOverlayAppInner() {
  const config = useAppConfig();
  useAppearanceSync(config);
  const { taskRepo, plannedTaskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const intendedSizeRef = useRef({ width: POPUP_W, height: POPUP_H });
  const isProgrammaticResizeRef = useRef(false);
  const isStartingTaskRef = useRef(false);
  const activePlannedTaskId = useRef<string | null>(null);
  // true quando um evento ao vivo já declarou o vínculo com a planejada — o que
  // inclui parar e cancelar, que o declaram ausente. A restauração do mount lê o
  // banco e resolve depois; sem esta marca, o que chegar nesse intervalo seria
  // sobrescrito pelo estado anterior: um start perderia o vínculo, e um stop
  // ressuscitaria na tela uma tarefa que já não existe. Pause e resume não
  // levantam a marca de propósito — eles nada dizem sobre a origem, e abortar a
  // restauração por causa deles deixaria os chips de "Ações" vazios.
  const liveTaskStateRef = useRef(false);
  /** Em ref, e não em `config.get`: esta janela carrega a config no boot, e a
   *  troca feita na janela principal só chega por evento. */
  const showOnStartRef = useRef(true);
  // Modal aberto no conteúdo do popup (hoje, a edição de planejada). Segura o
  // fechamento automático: perder o foco ou apertar ESC com o modal aberto
  // jogaria fora o que o usuário está editando.
  const modalOpenRef = useRef(false);
  const handleModalOpenChange = useCallback((open: boolean) => {
    modalOpenRef.current = open;
  }, []);
  const [activePlannedTaskActions, setActivePlannedTaskActions] = useState<PlannedTaskAction[]>([]);
  const {
    prompt: meetingPrompt,
    respond: respondMeetingPrompt,
    activeRef: meetingPromptActiveRef,
  } = useMeetingPrompt({ width: POPUP_W, height: POPUP_H });

  // Programmatic resize with min/max locking to prevent manual resize
  const programmaticSetSize = useCallback(async (width: number, height: number) => {
    intendedSizeRef.current = { width, height };
    isProgrammaticResizeRef.current = true;
    await appWindow.setMinSize(null);
    await appWindow.setMaxSize(null);
    await appWindow.setSize(new LogicalSize(width, height));

    // Clamp vertically: if popup would overflow screen bottom, shift it up
    const monitor = await currentMonitor().catch(() => null);
    if (monitor) {
      const pos = await appWindow.outerPosition();
      const physH = Math.round(height * monitor.scaleFactor);
      const maxY = monitor.position.y + monitor.size.height - physH;
      if (pos.y > maxY) {
        await appWindow.setPosition(
          new PhysicalPosition(pos.x, Math.max(monitor.position.y, maxY))
        );
      }
    }

    await appWindow.setMinSize(new LogicalSize(width, height));
    await appWindow.setMaxSize(new LogicalSize(width, height));
    setTimeout(() => {
      isProgrammaticResizeRef.current = false;
    }, 80);
  }, []);

  // Lock manual resize
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://resize", () => {
      if (isProgrammaticResizeRef.current) return;
      const { width, height } = intendedSizeRef.current;
      void programmaticSetSize(width, height);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [programmaticSetSize]);

  useEffect(() => {
    if (!config.isLoaded) return;
    setOverlayOpacity(config.get("overlayOpacity") as number);
    showOnStartRef.current = config.get("overlayShowOnStart");
    void appWindow.setMinSize(new LogicalSize(POPUP_W, 100));
    void appWindow.setMaxSize(new LogicalSize(POPUP_W, POPUP_H));
    // Load initial running task — RUNNING_TASK_CHANGED is only emitted on mutations,
    // not on startup, so we query the DB directly.
    void getActiveTasks(taskRepo).then(async (tasks) => {
      const running = tasks.find((t) => t.status === "running");
      const active = running ?? tasks[0] ?? null;
      // Evento ao vivo durante a leitura ganha — ele é mais novo que o banco —, e
      // a guarda vem antes da tarefa, não só do vínculo: parar em outra janela
      // enquanto esta consulta corre ressuscitava na tela o que já não existe.
      if (liveTaskStateRef.current) return;
      setRunningTask(active);
      // Restaura a planejada de origem e suas ações: o RUNNING_TASK_CHANGED que
      // as trazia só é emitido em mutação, então reabrir o app durante uma tarefa
      // deixava os chips de "Ações" vazios e o Parar sem o vínculo para concluir.
      const plannedId = active?.plannedTaskId ?? null;
      activePlannedTaskId.current = plannedId;
      if (!plannedId) return;
      const planned = await plannedTaskRepo.findById(plannedId).catch(() => null);
      if (liveTaskStateRef.current) return;
      setActivePlannedTaskActions(planned?.actions ?? []);
    });
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlisten = listen<OverlayConfigChangedPayload>(
      OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED,
      ({ payload }) => {
        if (payload.key === "overlayOpacity") setOverlayOpacity(payload.value as number);
        if (payload.key === "overlayShowOnStart") showOnStartRef.current = payload.value as boolean;
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Auto-show/hide based on running task changes
  useEffect(() => {
    if (!config.isLoaded) return;
    const unlisten = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      async ({ payload }) => {
        setRunningTask(payload.task);
        // Atualiza a referência apenas quando o evento carrega plannedTaskId
        // explicitamente (start na janela principal ou no overlay). Eventos sem o
        // campo (pause/resume/update) não devem zerar a referência. Ao parar
        // (task = null), limpa tudo.
        if (!payload.task) {
          setActivePlannedTaskActions([]);
          activePlannedTaskId.current = null;
          liveTaskStateRef.current = true;
        } else if (payload.plannedTaskId !== undefined) {
          activePlannedTaskId.current = payload.plannedTaskId;
          liveTaskStateRef.current = true;
          // Carrega as ações da tarefa planejada de origem para exibir os chips.
          // Vale para qualquer origem (janela principal, atalho ou aviso de reunião),
          // não só o Play disparado a partir do próprio popup.
          if (payload.plannedTaskId) {
            const pt = await plannedTaskRepo.findById(payload.plannedTaskId).catch(() => null);
            setActivePlannedTaskActions(pt?.actions ?? []);
          } else {
            setActivePlannedTaskActions([]);
          }
        }
        if (payload.task) {
          if (showOnStartRef.current) {
            const isVis = await appWindow.isVisible();
            if (!isVis) {
              const mainWin = await WebviewWindow.getByLabel("main");
              const mainIsVisible = mainWin ? await mainWin.isVisible() : false;
              if (!mainIsVisible) {
                await positionPopupNearCompact(appWindow, {
                  width: POPUP_W,
                  height: POPUP_H,
                });
                await appWindow.show();
                await appWindow.setFocus();
              }
            }
          }
        } else {
          // Task stopped: show popup with idle state if overlayAlwaysVisible
          if (config.get("overlayAlwaysVisible")) {
            const isVis = await appWindow.isVisible();
            if (!isVis) {
              await positionPopupNearCompact(appWindow, {
                width: POPUP_W,
                height: POPUP_H,
              });
              await appWindow.show();
              await appWindow.setFocus();
            }
          }
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config, plannedTaskRepo]);

  // Close on blur (focus moved away from this popup). Enquanto um prompt de
  // reunião está ativo, ignora o blur — o prompt não deve sumir sem resposta.
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://blur", async () => {
      if (meetingPromptActiveRef.current || modalOpenRef.current) return;
      await emit(OVERLAY_EVENTS.OVERLAY_POPUP_CLOSED, {});
      await appWindow.hide();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [meetingPromptActiveRef]);

  // ESC closes popup — desativado enquanto um prompt de reunião aguarda resposta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (meetingPromptActiveRef.current || modalOpenRef.current) return;
      void emit(OVERLAY_EVENTS.OVERLAY_POPUP_CLOSED, {}).then(() => appWindow.hide());
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [meetingPromptActiveRef]);

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
        const task = await startTaskUC(
          taskRepo,
          { ...input, workspaceId },
          new Date().toISOString()
        );
        activePlannedTaskId.current = input.plannedTaskId ?? null;
        liveTaskStateRef.current = true;
        await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
          task,
          source: "overlay",
          plannedTaskId: input.plannedTaskId ?? null,
        } satisfies RunningTaskChangedPayload);
      } finally {
        isStartingTaskRef.current = false;
      }
    },
    [taskRepo, workspaceId]
  );

  const handlePlay = useCallback(
    async (task: PlannedTask) => {
      if (runningTask) return;
      setActivePlannedTaskActions(task.actions);
      await handleStartTask({
        name: task.name,
        projectId: task.projectId,
        categoryId: task.categoryId,
        billable: task.billable,
        plannedTaskId: task.id,
      });
    },
    [runningTask, handleStartTask]
  );

  const handlePause = useCallback(async () => {
    if (!runningTask) return;
    const updated = await pauseTaskUC(taskRepo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
      task: updated,
      source: "overlay",
    } satisfies RunningTaskChangedPayload);
  }, [taskRepo, runningTask]);

  const handleResume = useCallback(async () => {
    if (!runningTask) return;
    const updated = await resumeTaskUC(taskRepo, runningTask.id, new Date().toISOString());
    setRunningTask(updated);
    await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
      task: updated,
      source: "overlay",
    } satisfies RunningTaskChangedPayload);
  }, [taskRepo, runningTask]);

  const handleStop = useCallback(
    async (completed: boolean, endTimeISO?: string) => {
      if (!runningTask) return;
      const nowISO = new Date().toISOString();
      const stoppedTask = await stopTaskUC(taskRepo, runningTask.id, endTimeISO ?? nowISO, nowISO);
      const plannedTaskId = activePlannedTaskId.current;
      activePlannedTaskId.current = null;
      setActivePlannedTaskActions([]);
      setRunningTask(null);
      await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
        task: null,
        source: "overlay",
      } satisfies RunningTaskChangedPayload);
      await emit(OVERLAY_EVENTS.TASK_STOPPED, {
        task: stoppedTask,
        completed,
        plannedTaskId,
      } satisfies TaskStoppedPayload);
    },
    [taskRepo, runningTask]
  );

  const handleCancel = useCallback(async () => {
    if (!runningTask) return;
    await cancelTaskUC(taskRepo, runningTask.id);
    activePlannedTaskId.current = null;
    setActivePlannedTaskActions([]);
    setRunningTask(null);
    await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
      task: null,
      source: "overlay",
    } satisfies RunningTaskChangedPayload);
  }, [taskRepo, runningTask]);

  const handleUpdate = useCallback(
    async (input: {
      name?: string | null;
      projectId?: string | null;
      categoryId?: string | null;
      billable?: boolean;
      startTime?: string;
      customValues?: CustomValues;
    }) => {
      if (!runningTask) return;
      const updated = await updateTaskUC(taskRepo, runningTask.id, input, new Date().toISOString());
      setRunningTask(updated);
      await emit(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, {
        task: updated,
        source: "overlay",
        plannedTaskId: activePlannedTaskId.current,
      } satisfies RunningTaskChangedPayload);
      // Configurar a tarefa aqui, depois de iniciá-la, configura também a
      // planejada de origem — sem isso a próxima ocorrência voltava crua. Mesma
      // regra do `updateActiveTask` da janela principal, e o mesmo fallback no
      // vínculo gravado na tarefa (§4.1).
      const plannedId = activePlannedTaskId.current ?? updated.plannedTaskId;
      if (!plannedId) return;
      const planned = await applyRunningTaskEditToPlanned(plannedTaskRepo, plannedId, input);
      if (planned) await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
    },
    [taskRepo, plannedTaskRepo, runningTask]
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
      {meetingPrompt ? (
        <MeetingPromptView prompt={meetingPrompt} onRespond={respondMeetingPrompt} />
      ) : (
        <PopupOverlayContent
          runningTask={runningTask}
          activePlannedTaskActions={activePlannedTaskActions}
          onNavigatePlanning={handleNavigatePlanning}
          onResize={programmaticSetSize}
          onModalOpenChange={handleModalOpenChange}
          onStartTask={handleStartTask}
          onPlay={handlePlay}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onCancel={handleCancel}
          onUpdateTask={handleUpdate}
        />
      )}
    </div>
  );
}

export function PopupOverlayApp() {
  return (
    <ConfigProvider>
      <RepositoriesProvider>
        <WorkspaceProvider>
          <PopupOverlayAppInner />
        </WorkspaceProvider>
      </RepositoriesProvider>
    </ConfigProvider>
  );
}

import type { Task } from "@domain/entities/Task";
import type { RunningTaskChangedPayload, TaskStoppedPayload } from "@shared/types/overlayEvents";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

interface OverlaySyncOptions {
  onTaskChanged: (task: Task | null, plannedTaskId: string | null | undefined) => void;
  onTaskStopped: (task: Task, plannedTaskId: string | null | undefined, completed: boolean) => void;
}

export function useOverlaySync({ onTaskChanged, onTaskStopped }: OverlaySyncOptions) {
  useEffect(() => {
    const unlisten = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      ({ payload }) => {
        if (payload.source !== "overlay") return;
        onTaskChanged(payload.task, payload.plannedTaskId);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlisten = listen<TaskStoppedPayload>(OVERLAY_EVENTS.TASK_STOPPED, ({ payload }) => {
      onTaskStopped(payload.task, payload.plannedTaskId, payload.completed);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

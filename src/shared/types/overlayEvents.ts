import type { Task } from "@domain/entities/Task";

export const OVERLAY_EVENTS = {
  RUNNING_TASK_CHANGED: "running-task-changed",
  OVERLAY_NAVIGATE_PLANNING: "overlay-navigate-planning",
  OVERLAY_FOCUS_TASK_EDIT: "overlay-focus-task-edit",
  WELCOME_CLOSED: "welcome-closed",
  OVERLAY_SET_MODE: "overlay-set-mode",
  OVERLAY_CONFIG_CHANGED: "overlay-config-changed",
  TASK_STOPPED: "task-stopped",
  TOAST_MESSAGE: "toast-message",
  NAVIGATE_SETTINGS: "navigate-settings",
} as const;

export interface RunningTaskChangedPayload {
  task: Task | null;
  source: string;
}

export interface WelcomeClosedPayload {
  action: "navigate-planning" | "start-task" | "close";
}

export interface OverlaySetModePayload {
  mode: "execution" | "planning" | "compact";
}

export interface OverlayConfigChangedPayload {
  key: string;
  value: unknown;
}

export interface TaskStoppedPayload {
  task: Task;
  completed: boolean;
}

export type ToastVariant = "success" | "error" | "info" | "update";

export interface ToastMessagePayload {
  variant: ToastVariant;
  message: string;
  duration?: number;
  actionLabel?: string;
  actionEvent?: string;
}

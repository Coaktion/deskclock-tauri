import type { Task } from "@domain/entities/Task";

export const OVERLAY_EVENTS = {
  RUNNING_TASK_CHANGED: "running-task-changed",
  OVERLAY_NAVIGATE_PLANNING: "overlay-navigate-planning",
  OVERLAY_FOCUS_TASK_EDIT: "overlay-focus-task-edit",
  OVERLAY_SET_MODE: "overlay-set-mode",
  OVERLAY_CONFIG_CHANGED: "overlay-config-changed",
  TASK_STOPPED: "task-stopped",
  TOAST_MESSAGE: "toast-message",
  NAVIGATE_SETTINGS: "navigate-settings",
  PLANNED_TASKS_CHANGED: "planned-tasks-changed",
  COMMAND_PALETTE_NAVIGATE: "command-palette:navigate",
  COMMAND_PALETTE_START_TASK: "command-palette:start-task",
  OVERLAY_POPUP_CLOSED: "overlay-popup:closed",
} as const;

export interface CommandPaletteNavigatePayload {
  page: string;
}

export interface CommandPaletteStartTaskPayload {
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable: boolean;
  plannedTaskId?: string | null;
}

export interface RunningTaskChangedPayload {
  task: Task | null;
  source: string;
  plannedTaskId?: string | null;
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
  plannedTaskId?: string | null;
}

export type ToastVariant = "success" | "error" | "info" | "update";

export interface ToastMessagePayload {
  variant: ToastVariant;
  message: string;
  duration?: number;
  actionLabel?: string;
  actionEvent?: string;
}

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
  TASKS_CHANGED: "tasks-changed",
  COMMAND_PALETTE_NAVIGATE: "command-palette:navigate",
  OVERLAY_OPEN_APP: "overlay-open-app",
  COMMAND_PALETTE_START_TASK: "command-palette:start-task",
  DEEPLINK_NAVIGATE: "deeplink:navigate",
  DEEPLINK_START_TASK: "deeplink:start-task",
  DEEPLINK_RETROACTIVE_PREFILL: "deeplink:retroactive-prefill",
  OVERLAY_POPUP_CLOSED: "overlay-popup:closed",
  MEETING_PROMPT: "meeting-prompt",
  MEETING_PROMPT_RESPONSE: "meeting-prompt:response",
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

/** Tipo de prompt de reunião: início do evento ou fim (ainda em andamento?). */
export type MeetingPromptKind = "start" | "end";

/** main → overlay-popup: solicita exibição de um prompt de reunião. */
export interface MeetingPromptPayload {
  kind: MeetingPromptKind;
  calendarEventId: string;
  title: string;
}

/**
 * overlay-popup → main: resposta do usuário ao prompt.
 * - kind "start": action "start" (iniciar) | "dismiss" (agora não)
 * - kind "end":   action "stop" (encerrar)  | "still-going" (ainda em andamento)
 */
export interface MeetingPromptResponsePayload {
  kind: MeetingPromptKind;
  calendarEventId: string;
  action: "start" | "dismiss" | "stop" | "still-going";
}

export type ToastVariant = "success" | "error" | "info" | "update" | "warning";

export interface ToastMessagePayload {
  variant: ToastVariant;
  message: string;
  duration?: number;
  actionLabel?: string;
  actionEvent?: string;
}

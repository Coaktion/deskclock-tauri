import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";

/** O que o Rust manda em `local-api:request`. Cada op usa só o que precisa. */
export interface LocalApiParams {
  id?: string;
  date?: string | null;
  workspaceId?: string | null;
  body?: unknown;
}

export interface LocalApiResult {
  status: number;
  body: unknown;
}

export type RunningTaskOps = Pick<
  RunningTaskContextValue,
  | "runningTask"
  | "startTask"
  | "switchToTask"
  | "pauseTask"
  | "resumeTask"
  | "stopTask"
  | "cancelTask"
>;

/**
 * Retrato do app no instante em que a requisição começa. É montado a cada
 * render: as operações do contexto fecham sobre a tarefa em execução daquele
 * render, e um retrato velho pausaria uma tarefa que já foi parada.
 */
export interface LocalApiDeps {
  taskRepo: ITaskRepository;
  plannedTaskRepo: IPlannedTaskRepository;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
  workspaceRepo: IWorkspaceRepository;
  activeWorkspaceId: string;
  running: RunningTaskOps;
  notifyPlannedTasksChanged: () => Promise<void>;
  nowISO: () => string;
  todayISO: () => string;
}

export type LocalApiHandler = (
  deps: LocalApiDeps,
  params: LocalApiParams
) => Promise<LocalApiResult>;

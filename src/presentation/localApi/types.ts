import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";
import type { WorkspaceContextValue } from "@presentation/contexts/WorkspaceContext";
import type { useWorkspaceAdmin } from "@presentation/hooks/useWorkspaceAdmin";

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
 * As mutações de workspace da UI. Vêm dos hooks, e não dos use cases, porque
 * a recarga da lista, o `WORKSPACE_CHANGED` e a troca do ativo quando ele é
 * excluído moram lá.
 */
export type WorkspaceOps = Pick<
  ReturnType<typeof useWorkspaceAdmin>,
  "create" | "update" | "remove"
> &
  Pick<WorkspaceContextValue, "switchTo">;

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
  projectCategoryRepo: IProjectCategoryRepository;
  customFieldRepo: ICustomFieldRepository;
  activeWorkspaceId: string;
  running: RunningTaskOps;
  workspaces: WorkspaceOps;
  notifyPlannedTasksChanged: () => Promise<void>;
  notifyProjectsChanged: () => Promise<void>;
  notifyCategoriesChanged: () => Promise<void>;
  notifyProjectCategoriesChanged: () => Promise<void>;
  notifyCustomFieldsChanged: () => Promise<void>;
  nowISO: () => string;
  todayISO: () => string;
}

export type LocalApiHandler = (
  deps: LocalApiDeps,
  params: LocalApiParams
) => Promise<LocalApiResult>;

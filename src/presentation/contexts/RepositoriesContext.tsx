import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { TaskRepository } from "@infra/database/TaskRepository";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { ExportProfileRepository } from "@infra/database/ExportProfileRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { TrackedMeetingRepository } from "@infra/database/TrackedMeetingRepository";
import { MondayActivityItemRepository } from "@infra/database/MondayActivityItemRepository";
import { MondayImportedItemRepository } from "@infra/database/MondayImportedItemRepository";
import { WorkspaceRepository } from "@infra/database/WorkspaceRepository";
import { CustomFieldRepository } from "@infra/database/CustomFieldRepository";
import { ProjectCategoryRepository } from "@infra/database/ProjectCategoryRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { IMondayActivityItemRepository } from "@domain/repositories/IMondayActivityItemRepository";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { IWorkspaceDataPort } from "@domain/repositories/IWorkspaceDataPort";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";

export interface Repositories {
  taskRepo: ITaskRepository;
  plannedTaskRepo: IPlannedTaskRepository;
  categoryRepo: ICategoryRepository;
  projectRepo: IProjectRepository;
  exportProfileRepo: IExportProfileRepository;
  taskLogRepo: ITaskIntegrationLogRepository;
  trackedMeetingRepo: ITrackedMeetingRepository;
  mondayActivityItemRepo: IMondayActivityItemRepository;
  mondayImportedItemRepo: ITrackedMondayItemRepository;
  workspaceRepo: IWorkspaceRepository;
  workspaceDataPort: IWorkspaceDataPort;
  customFieldRepo: ICustomFieldRepository;
  projectCategoryRepo: IProjectCategoryRepository;
}

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoriesProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Partial<Repositories>;
}) {
  const defaultsRef = useRef<Repositories | undefined>(undefined);
  if (!defaultsRef.current) {
    const workspaceRepo = new WorkspaceRepository();
    defaultsRef.current = {
      taskRepo: new TaskRepository(),
      plannedTaskRepo: new PlannedTaskRepository(),
      categoryRepo: new CategoryRepository(),
      projectRepo: new ProjectRepository(),
      exportProfileRepo: new ExportProfileRepository(),
      taskLogRepo: new TaskIntegrationLogRepository(),
      trackedMeetingRepo: new TrackedMeetingRepository(),
      mondayActivityItemRepo: new MondayActivityItemRepository(),
      mondayImportedItemRepo: new MondayImportedItemRepository(),
      // A mesma instância serve as duas portas: o adaptador implementa ambas.
      workspaceRepo: workspaceRepo,
      workspaceDataPort: workspaceRepo,
      customFieldRepo: new CustomFieldRepository(),
      projectCategoryRepo: new ProjectCategoryRepository(),
    };
  }
  const repos = useMemo<Repositories>(() => ({ ...defaultsRef.current!, ...value }), [value]);
  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) {
    throw new Error("useRepositories must be used within a RepositoriesProvider");
  }
  return ctx;
}

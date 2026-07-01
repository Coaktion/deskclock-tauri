import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { TaskRepository } from "@infra/database/TaskRepository";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { ExportProfileRepository } from "@infra/database/ExportProfileRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { TrackedMeetingRepository } from "@infra/database/TrackedMeetingRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";

export interface Repositories {
  taskRepo: ITaskRepository;
  plannedTaskRepo: IPlannedTaskRepository;
  categoryRepo: ICategoryRepository;
  projectRepo: IProjectRepository;
  exportProfileRepo: IExportProfileRepository;
  taskLogRepo: ITaskIntegrationLogRepository;
  trackedMeetingRepo: ITrackedMeetingRepository;
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
    defaultsRef.current = {
      taskRepo: new TaskRepository(),
      plannedTaskRepo: new PlannedTaskRepository(),
      categoryRepo: new CategoryRepository(),
      projectRepo: new ProjectRepository(),
      exportProfileRepo: new ExportProfileRepository(),
      taskLogRepo: new TaskIntegrationLogRepository(),
      trackedMeetingRepo: new TrackedMeetingRepository(),
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

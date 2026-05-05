import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  taskRepo as defaultTaskRepo,
  plannedTaskRepo as defaultPlannedTaskRepo,
  categoryRepo as defaultCategoryRepo,
  projectRepo as defaultProjectRepo,
  exportProfileRepo as defaultExportProfileRepo,
  taskLogRepo as defaultTaskLogRepo,
} from "./repositories";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";

export interface Repositories {
  taskRepo: ITaskRepository;
  plannedTaskRepo: IPlannedTaskRepository;
  categoryRepo: ICategoryRepository;
  projectRepo: IProjectRepository;
  exportProfileRepo: IExportProfileRepository;
  taskLogRepo: ITaskIntegrationLogRepository;
}

const defaultRepositories: Repositories = {
  taskRepo: defaultTaskRepo,
  plannedTaskRepo: defaultPlannedTaskRepo,
  categoryRepo: defaultCategoryRepo,
  projectRepo: defaultProjectRepo,
  exportProfileRepo: defaultExportProfileRepo,
  taskLogRepo: defaultTaskLogRepo,
};

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoriesProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Partial<Repositories>;
}) {
  const repos = useMemo<Repositories>(() => ({ ...defaultRepositories, ...value }), [value]);
  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) {
    throw new Error("useRepositories must be used within a RepositoriesProvider");
  }
  return ctx;
}

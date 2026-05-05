import { TaskRepository } from "@infra/database/TaskRepository";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { ExportProfileRepository } from "@infra/database/ExportProfileRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";

export const taskRepo: ITaskRepository = new TaskRepository();
export const plannedTaskRepo: IPlannedTaskRepository = new PlannedTaskRepository();
export const categoryRepo: ICategoryRepository = new CategoryRepository();
export const projectRepo: IProjectRepository = new ProjectRepository();
export const exportProfileRepo: IExportProfileRepository = new ExportProfileRepository();
export const taskLogRepo: ITaskIntegrationLogRepository = new TaskIntegrationLogRepository();

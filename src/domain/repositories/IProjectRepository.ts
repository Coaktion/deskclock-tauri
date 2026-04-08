import type { Project } from "@domain/entities/Project";
import type { UUID } from "@shared/types";

export interface IProjectRepository {
  findAll(): Promise<Project[]>;
  findByName(name: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  delete(id: UUID): Promise<void>;
}

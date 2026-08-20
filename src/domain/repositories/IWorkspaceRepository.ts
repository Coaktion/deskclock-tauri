import type { Workspace } from "@domain/entities/Workspace";
import type { UUID } from "@shared/types";

export interface IWorkspaceRepository {
  findAll(): Promise<Workspace[]>;
  findById(id: UUID): Promise<Workspace | null>;
  findByName(name: string): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  update(id: UUID, name: string, color: string): Promise<void>;
  delete(id: UUID): Promise<void>;
}

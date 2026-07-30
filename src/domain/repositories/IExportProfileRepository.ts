import type { ExportProfile } from "@domain/entities/ExportProfile";
import type { UUID } from "@shared/types";

export interface IExportProfileRepository {
  /** `workspaceId` omitido devolve os perfis de TODOS os workspaces. */
  findAll(workspaceId?: UUID): Promise<ExportProfile[]>;
  findById(id: UUID): Promise<ExportProfile | null>;
  /** O perfil padrão passa a ser único por workspace, não global. */
  findDefault(workspaceId: UUID): Promise<ExportProfile | null>;
  save(profile: ExportProfile): Promise<void>;
  update(profile: ExportProfile): Promise<void>;
  setDefault(id: UUID): Promise<void>;
  delete(id: UUID): Promise<void>;
}

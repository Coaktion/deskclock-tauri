import type { ExportProfile } from "@domain/entities/ExportProfile";
import type { UUID } from "@shared/types";

export interface IExportProfileRepository {
  findAll(): Promise<ExportProfile[]>;
  findById(id: UUID): Promise<ExportProfile | null>;
  findDefault(): Promise<ExportProfile | null>;
  save(profile: ExportProfile): Promise<void>;
  update(profile: ExportProfile): Promise<void>;
  setDefault(id: UUID): Promise<void>;
  delete(id: UUID): Promise<void>;
}

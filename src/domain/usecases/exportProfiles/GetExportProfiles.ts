import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ExportProfile } from "@domain/entities/ExportProfile";

export async function getExportProfiles(repo: IExportProfileRepository): Promise<ExportProfile[]> {
  return repo.findAll();
}

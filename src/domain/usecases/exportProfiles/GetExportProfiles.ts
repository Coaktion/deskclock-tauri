import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import type { UUID } from "@shared/types";

/** `workspaceId` omitido devolve os perfis de todos os workspaces. */
export async function getExportProfiles(
  repo: IExportProfileRepository,
  workspaceId?: UUID
): Promise<ExportProfile[]> {
  return repo.findAll(workspaceId);
}

import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { UUID } from "@shared/types";

export async function setDefaultExportProfile(repo: IExportProfileRepository, id: UUID): Promise<void> {
  await repo.setDefault(id);
}

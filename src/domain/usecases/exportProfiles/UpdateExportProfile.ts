import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import type { UUID } from "@shared/types";

type UpdateInput = Partial<Omit<ExportProfile, "id">>;

export async function updateExportProfile(
  repo: IExportProfileRepository,
  id: UUID,
  input: UpdateInput
): Promise<ExportProfile> {
  const existing = await repo.findById(id);
  if (!existing) throw new Error(`ExportProfile não encontrado: ${id}`);
  const updated: ExportProfile = { ...existing, ...input };
  await repo.update(updated);
  if (input.isDefault) await repo.setDefault(id);
  return updated;
}

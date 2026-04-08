import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ExportProfile, ExportFormat, CsvSeparator, DurationFormat, DateFormat } from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";
import { generateUUID } from "@shared/utils/uuid";

interface CreateInput {
  name: string;
  format: ExportFormat;
  separator: CsvSeparator;
  durationFormat: DurationFormat;
  dateFormat: DateFormat;
  isDefault?: boolean;
  columns?: ExportProfile["columns"];
}

export async function createExportProfile(
  repo: IExportProfileRepository,
  input: CreateInput
): Promise<ExportProfile> {
  const profile: ExportProfile = {
    id: generateUUID(),
    name: input.name,
    isDefault: input.isDefault ?? false,
    format: input.format,
    separator: input.separator,
    durationFormat: input.durationFormat,
    dateFormat: input.dateFormat,
    columns: input.columns ?? [...DEFAULT_COLUMNS],
  };
  await repo.save(profile);
  if (profile.isDefault) await repo.setDefault(profile.id);
  return profile;
}

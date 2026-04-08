import { useState, useEffect, useCallback } from "react";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import { ExportProfileRepository } from "@infra/database/ExportProfileRepository";
import { getExportProfiles } from "@domain/usecases/exportProfiles/GetExportProfiles";
import { createExportProfile } from "@domain/usecases/exportProfiles/CreateExportProfile";
import { updateExportProfile } from "@domain/usecases/exportProfiles/UpdateExportProfile";
import { deleteExportProfile } from "@domain/usecases/exportProfiles/DeleteExportProfile";
import { setDefaultExportProfile } from "@domain/usecases/exportProfiles/SetDefaultExportProfile";
import type { UUID } from "@shared/types";

const repo = new ExportProfileRepository();

type CreateInput = Parameters<typeof createExportProfile>[1];
type UpdateInput = Parameters<typeof updateExportProfile>[2];

export function useExportProfiles() {
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);

  const load = useCallback(async () => {
    setProfiles(await getExportProfiles(repo));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async (input: CreateInput) => {
    await createExportProfile(repo, input);
    await load();
  }, [load]);

  const update = useCallback(async (id: UUID, input: UpdateInput) => {
    await updateExportProfile(repo, id, input);
    await load();
  }, [load]);

  const remove = useCallback(async (id: UUID) => {
    await deleteExportProfile(repo, id);
    await load();
  }, [load]);

  const setDefault = useCallback(async (id: UUID) => {
    await setDefaultExportProfile(repo, id);
    await load();
  }, [load]);

  return { profiles, reload: load, create, update, remove, setDefault };
}

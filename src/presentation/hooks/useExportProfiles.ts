import { useState, useEffect, useCallback } from "react";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { getExportProfiles } from "@domain/usecases/exportProfiles/GetExportProfiles";
import { createExportProfile } from "@domain/usecases/exportProfiles/CreateExportProfile";
import { updateExportProfile } from "@domain/usecases/exportProfiles/UpdateExportProfile";
import { deleteExportProfile } from "@domain/usecases/exportProfiles/DeleteExportProfile";
import { setDefaultExportProfile } from "@domain/usecases/exportProfiles/SetDefaultExportProfile";
import type { UUID } from "@shared/types";


type CreateInput = Parameters<typeof createExportProfile>[1];
type UpdateInput = Parameters<typeof updateExportProfile>[2];

export function useExportProfiles() {
  const { exportProfileRepo } = useRepositories();
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);

  const load = useCallback(async () => {
    setProfiles(await getExportProfiles(exportProfileRepo));
  }, [exportProfileRepo]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (input: CreateInput) => {
      await createExportProfile(exportProfileRepo, input);
      await load();
    },
    [exportProfileRepo, load]
  );

  const update = useCallback(
    async (id: UUID, input: UpdateInput) => {
      await updateExportProfile(exportProfileRepo, id, input);
      await load();
    },
    [exportProfileRepo, load]
  );

  const remove = useCallback(
    async (id: UUID) => {
      await deleteExportProfile(exportProfileRepo, id);
      await load();
    },
    [exportProfileRepo, load]
  );

  const setDefault = useCallback(
    async (id: UUID) => {
      await setDefaultExportProfile(exportProfileRepo, id);
      await load();
    },
    [exportProfileRepo, load]
  );

  return { profiles, reload: load, create, update, remove, setDefault };
}

import { useState, useEffect, useCallback } from "react";
import type { CustomField } from "@domain/entities/CustomField";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { getCustomFields, activeCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import {
  createCustomField,
  type CreateCustomFieldInput,
} from "@domain/usecases/customFields/CreateCustomField";
import {
  updateCustomField,
  type UpdateCustomFieldInput,
} from "@domain/usecases/customFields/UpdateCustomField";
import { deleteCustomField } from "@domain/usecases/customFields/DeleteCustomField";
import type { UUID } from "@shared/types";

/**
 * Campos personalizados são **globais**: ao contrário de `useProjects`, este
 * hook não lê o workspace ativo. Ver `docs/specs/workspaces-custom-fields.md`.
 */
export function useCustomFields() {
  const { customFieldRepo } = useRepositories();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFields(await getCustomFields(customFieldRepo));
    setLoading(false);
  }, [customFieldRepo]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (input: CreateCustomFieldInput) => {
      await createCustomField(customFieldRepo, input, new Date().toISOString());
      await load();
    },
    [customFieldRepo, load]
  );

  const handleUpdate = useCallback(
    async (id: UUID, input: UpdateCustomFieldInput) => {
      await updateCustomField(customFieldRepo, id, input);
      await load();
    },
    [customFieldRepo, load]
  );

  const handleDelete = useCallback(
    async (id: UUID) => {
      await deleteCustomField(customFieldRepo, id);
      await load();
    },
    [customFieldRepo, load]
  );

  return {
    fields,
    /** Os que os formulários oferecem — arquivados ficam de fora. */
    activeFields: activeCustomFields(fields),
    loading,
    reload: load,
    createField: handleCreate,
    updateField: handleUpdate,
    deleteField: handleDelete,
  };
}

export type UseCustomFieldsResult = ReturnType<typeof useCustomFields>;

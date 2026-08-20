import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { CustomField } from "@domain/entities/CustomField";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { notifyCustomFieldsChanged } from "@shared/utils/catalogSync";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
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
 * hook não lê o workspace ativo. Ver `docs-internal/specs/workspaces-custom-fields.md`.
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

  // Recarrega quando outra janela mexe no catálogo, como em `useProjects`. O
  // `load` não emite nada — só as mutações emitem —, ou o evento realimentaria
  // o ciclo.
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.CUSTOM_FIELDS_CHANGED, () => void load());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  /** Devolve o campo criado: quem cria a partir de uma integração precisa do id. */
  const handleCreate = useCallback(
    async (input: CreateCustomFieldInput) => {
      const field = await createCustomField(customFieldRepo, input, new Date().toISOString());
      await load();
      await notifyCustomFieldsChanged();
      return field;
    },
    [customFieldRepo, load]
  );

  const handleUpdate = useCallback(
    async (id: UUID, input: UpdateCustomFieldInput) => {
      await updateCustomField(customFieldRepo, id, input);
      await load();
      await notifyCustomFieldsChanged();
    },
    [customFieldRepo, load]
  );

  const handleDelete = useCallback(
    async (id: UUID) => {
      await deleteCustomField(customFieldRepo, id);
      await load();
      await notifyCustomFieldsChanged();
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

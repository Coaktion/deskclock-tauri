import { useEffect, useState } from "react";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import type {
  ClockifyHydratedProject,
  ClockifyHydratedTag,
  ClockifyTimeEntryFull,
  ClockifyTimeEntryPayload,
} from "@shared/types/clockify";
import { startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";

export function projectDisplayName(p: { name: string; clientName?: string | null }): string {
  return p.clientName ? `${p.clientName} - ${p.name}` : p.name;
}

interface UseClockifyEntriesOptions {
  apiKey: string;
  workspaceId: string;
  userId: string;
  range: { start: string; end: string };
  rangeValid: boolean;
}

export function useClockifyEntries({
  apiKey,
  workspaceId,
  userId,
  range,
  rangeValid,
}: UseClockifyEntriesOptions) {
  const { createClockifyApi } = useIntegrations();
  const [entries, setEntries] = useState<ClockifyTimeEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [clockifyProjects, setClockifyProjects] = useState<ClockifyHydratedProject[]>([]);
  const [clockifyTags, setClockifyTags] = useState<ClockifyHydratedTag[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!apiKey || !workspaceId || !userId || !rangeValid) return;
    const client = createClockifyApi(apiKey);
    setLoading(true);
    client
      .listTimeEntries(workspaceId, userId, startOfDayISO(range.start), endOfDayISO(range.end))
      .then(setEntries)
      .catch((err: unknown) => {
        void showToast("error", err instanceof Error ? err.message : "Erro ao carregar apontamentos.");
      })
      .finally(() => setLoading(false));
  }, [apiKey, workspaceId, userId, range.start, range.end, rangeValid, refreshSignal, createClockifyApi]);

  useEffect(() => {
    if (!apiKey || !workspaceId) return;
    const client = createClockifyApi(apiKey);
    Promise.all([client.listProjects(workspaceId), client.listTags(workspaceId)])
      .then(([ps, ts]) => {
        setClockifyProjects(
          [...ps].sort((a, b) =>
            projectDisplayName(a).localeCompare(projectDisplayName(b), "pt-BR", {
              sensitivity: "base",
            })
          )
        );
        setClockifyTags(
          [...ts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
        );
      })
      .catch((err: unknown) => {
        void showToast(
          "error",
          err instanceof Error ? err.message : "Erro ao carregar projetos/tags."
        );
      });
  }, [apiKey, workspaceId, createClockifyApi]);

  async function handleSaveEdit(entryId: string, payload: ClockifyTimeEntryPayload) {
    const client = createClockifyApi(apiKey);
    try {
      await client.updateTimeEntry(workspaceId, entryId, payload);
      await showToast("success", "Apontamento atualizado.");
      setEditingId(null);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao salvar.");
    }
  }

  async function handleCreate(payload: ClockifyTimeEntryPayload) {
    const client = createClockifyApi(apiKey);
    try {
      await client.createTimeEntry(workspaceId, payload);
      await showToast("success", "Apontamento criado.");
      setCreateOpen(false);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao criar.");
    }
  }

  async function handleDelete(entryId: string) {
    const client = createClockifyApi(apiKey);
    try {
      await client.deleteTimeEntry(workspaceId, entryId);
      await showToast("success", "Apontamento excluído.");
      if (editingId === entryId) setEditingId(null);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  return {
    entries,
    loading,
    clockifyProjects,
    clockifyTags,
    editingId,
    setEditingId,
    createOpen,
    setCreateOpen,
    refresh: () => setRefreshSignal((n) => n + 1),
    handleSaveEdit,
    handleCreate,
    handleDelete,
  };
}

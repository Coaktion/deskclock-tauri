import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Project } from "@domain/entities/Project";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { notifyProjectsChanged } from "@shared/utils/catalogSync";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { bulkImportProjects } from "@domain/usecases/projects/BulkImportProjects";
import { deleteProject } from "@domain/usecases/projects/DeleteProject";
import { deleteProjects } from "@domain/usecases/projects/DeleteProjects";
import { updateProject } from "@domain/usecases/projects/UpdateProject";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";

export function useProjects() {
  const { projectRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getProjects(projectRepo, workspaceId);
    setProjects(data);
    setLoading(false);
  }, [projectRepo, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // Recarrega quando outra janela mexe no catálogo. O `load` não emite nada —
  // só as mutações emitem —, ou o próprio evento realimentaria o ciclo.
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.PROJECTS_CHANGED, () => void load());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  const handleCreate = useCallback(
    async (name: string) => {
      await createProject(projectRepo, name, workspaceId);
      await load();
      await notifyProjectsChanged();
    },
    [projectRepo, load, workspaceId]
  );

  const handleBulkImport = useCallback(
    async (rawText: string) => {
      const result = await bulkImportProjects(projectRepo, rawText, workspaceId);
      await load();
      await notifyProjectsChanged();
      return result;
    },
    [projectRepo, load, workspaceId]
  );

  const handleUpdate = useCallback(
    async (id: string, name: string) => {
      await updateProject(projectRepo, id, name, workspaceId);
      await load();
      await notifyProjectsChanged();
    },
    [projectRepo, load, workspaceId]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProject(projectRepo, id);
      await load();
      await notifyProjectsChanged();
    },
    [projectRepo, load]
  );

  const handleDeleteMany = useCallback(
    async (ids: string[]) => {
      await deleteProjects(projectRepo, ids);
      await load();
      await notifyProjectsChanged();
    },
    [projectRepo, load]
  );

  return {
    projects,
    loading,
    reload: load,
    createProject: handleCreate,
    bulkImportProjects: handleBulkImport,
    updateProject: handleUpdate,
    deleteProject: handleDelete,
    deleteProjects: handleDeleteMany,
  };
}

export type UseProjectsResult = ReturnType<typeof useProjects>;

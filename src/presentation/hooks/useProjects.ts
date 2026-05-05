import { useState, useEffect, useCallback } from "react";
import type { Project } from "@domain/entities/Project";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { bulkImportProjects } from "@domain/usecases/projects/BulkImportProjects";
import { deleteProject } from "@domain/usecases/projects/DeleteProject";
import { updateProject } from "@domain/usecases/projects/UpdateProject";


export function useProjects() {
  const { projectRepo } = useRepositories();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getProjects(projectRepo);
    setProjects(data);
    setLoading(false);
  }, [projectRepo]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(
    async (name: string) => {
      await createProject(projectRepo, name);
      await load();
    },
    [projectRepo, load]
  );

  const handleBulkImport = useCallback(
    async (rawText: string) => {
      const result = await bulkImportProjects(projectRepo, rawText);
      await load();
      return result;
    },
    [projectRepo, load]
  );

  const handleUpdate = useCallback(
    async (id: string, name: string) => {
      await updateProject(projectRepo, id, name);
      await load();
    },
    [projectRepo, load]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProject(projectRepo, id);
      await load();
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
  };
}

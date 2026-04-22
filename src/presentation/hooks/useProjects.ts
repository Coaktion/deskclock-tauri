import { useState, useEffect, useCallback } from "react";
import type { Project } from "@domain/entities/Project";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { bulkImportProjects } from "@domain/usecases/projects/BulkImportProjects";
import { deleteProject } from "@domain/usecases/projects/DeleteProject";
import { updateProject } from "@domain/usecases/projects/UpdateProject";

const repo = new ProjectRepository();

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getProjects(repo);
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(
    async (name: string) => {
      await createProject(repo, name);
      await load();
    },
    [load]
  );

  const handleBulkImport = useCallback(
    async (rawText: string) => {
      const result = await bulkImportProjects(repo, rawText);
      await load();
      return result;
    },
    [load]
  );

  const handleUpdate = useCallback(
    async (id: string, name: string) => {
      await updateProject(repo, id, name);
      await load();
    },
    [load]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProject(repo, id);
      await load();
    },
    [load]
  );

  return {
    projects,
    loading,
    createProject: handleCreate,
    bulkImportProjects: handleBulkImport,
    updateProject: handleUpdate,
    deleteProject: handleDelete,
  };
}

import { useState, useEffect, useCallback } from "react";
import type { Category } from "@domain/entities/Category";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { bulkImportCategories } from "@domain/usecases/categories/BulkImportCategories";
import { deleteCategory } from "@domain/usecases/categories/DeleteCategory";
import { deleteCategories } from "@domain/usecases/categories/DeleteCategories";
import { updateCategory } from "@domain/usecases/categories/UpdateCategory";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";

export function useCategories() {
  const { categoryRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCategories(categoryRepo, workspaceId);
    setCategories(data);
    setLoading(false);
  }, [categoryRepo, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(
    async (name: string, defaultBillable: boolean) => {
      await createCategory(categoryRepo, name, defaultBillable, workspaceId);
      await load();
    },
    [categoryRepo, load, workspaceId]
  );

  const handleBulkImport = useCallback(
    async (rawText: string) => {
      const result = await bulkImportCategories(categoryRepo, rawText, workspaceId);
      await load();
      return result;
    },
    [categoryRepo, load, workspaceId]
  );

  const handleUpdate = useCallback(
    async (id: string, name: string, defaultBillable: boolean) => {
      await updateCategory(categoryRepo, id, name, defaultBillable, workspaceId);
      await load();
    },
    [categoryRepo, load, workspaceId]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteCategory(categoryRepo, id);
      await load();
    },
    [categoryRepo, load]
  );

  const handleDeleteMany = useCallback(
    async (ids: string[]) => {
      await deleteCategories(categoryRepo, ids);
      await load();
    },
    [categoryRepo, load]
  );

  return {
    categories,
    loading,
    reload: load,
    createCategory: handleCreate,
    bulkImportCategories: handleBulkImport,
    updateCategory: handleUpdate,
    deleteCategory: handleDelete,
    deleteCategories: handleDeleteMany,
  };
}

export type UseCategoriesResult = ReturnType<typeof useCategories>;

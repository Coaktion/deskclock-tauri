import { useState, useEffect, useCallback } from "react";
import type { Category } from "@domain/entities/Category";
import { categoryRepo } from "@presentation/contexts/repositories";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { bulkImportCategories } from "@domain/usecases/categories/BulkImportCategories";
import { deleteCategory } from "@domain/usecases/categories/DeleteCategory";
import { updateCategory } from "@domain/usecases/categories/UpdateCategory";


export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCategories(categoryRepo);
    setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(
    async (name: string, defaultBillable: boolean) => {
      await createCategory(categoryRepo, name, defaultBillable);
      await load();
    },
    [load]
  );

  const handleBulkImport = useCallback(
    async (rawText: string) => {
      const result = await bulkImportCategories(categoryRepo, rawText);
      await load();
      return result;
    },
    [load]
  );

  const handleUpdate = useCallback(
    async (id: string, name: string, defaultBillable: boolean) => {
      await updateCategory(categoryRepo, id, name, defaultBillable);
      await load();
    },
    [load]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteCategory(categoryRepo, id);
      await load();
    },
    [load]
  );

  return {
    categories,
    loading,
    reload: load,
    createCategory: handleCreate,
    bulkImportCategories: handleBulkImport,
    updateCategory: handleUpdate,
    deleteCategory: handleDelete,
  };
}

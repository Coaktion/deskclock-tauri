import { getDb } from "./db";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

interface CategoryRow {
  id: string;
  workspace_id: string;
  name: string;
  default_billable: number;
}

function rowToCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    defaultBillable: r.default_billable === 1,
  };
}

export class CategoryRepository implements ICategoryRepository {
  async findAll(workspaceId?: UUID): Promise<Category[]> {
    const db = await getDb();
    const rows = workspaceId
      ? await db.select<CategoryRow[]>(
          "SELECT id, workspace_id, name, default_billable FROM categories WHERE workspace_id = $1 ORDER BY name ASC",
          [workspaceId]
        )
      : await db.select<CategoryRow[]>(
          "SELECT id, workspace_id, name, default_billable FROM categories ORDER BY name ASC"
        );
    return rows.map(rowToCategory);
  }

  async findByName(name: string, workspaceId: UUID): Promise<Category | null> {
    const db = await getDb();
    const rows = await db.select<CategoryRow[]>(
      "SELECT id, workspace_id, name, default_billable FROM categories WHERE name = $1 AND workspace_id = $2",
      [name, workspaceId]
    );
    return rows[0] ? rowToCategory(rows[0]) : null;
  }

  async save(category: Category): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO categories (id, workspace_id, name, default_billable) VALUES ($1, $2, $3, $4)",
      [category.id, category.workspaceId, category.name, category.defaultBillable ? 1 : 0]
    );
  }

  async update(id: UUID, name: string, defaultBillable: boolean): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE categories SET name = $1, default_billable = $2 WHERE id = $3", [
      name,
      defaultBillable ? 1 : 0,
      id,
    ]);
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM categories WHERE id = $1", [id]);
  }
}

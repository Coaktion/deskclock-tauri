import { getDb } from "./db";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

interface CategoryRow {
  id: string;
  name: string;
  default_billable: number;
}

export class CategoryRepository implements ICategoryRepository {
  async findAll(): Promise<Category[]> {
    const db = await getDb();
    const rows = await db.select<CategoryRow[]>(
      "SELECT id, name, default_billable FROM categories ORDER BY name ASC"
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      defaultBillable: r.default_billable === 1,
    }));
  }

  async findByName(name: string): Promise<Category | null> {
    const db = await getDb();
    const rows = await db.select<CategoryRow[]>(
      "SELECT id, name, default_billable FROM categories WHERE name = $1",
      [name]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      name: rows[0].name,
      defaultBillable: rows[0].default_billable === 1,
    };
  }

  async save(category: Category): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT INTO categories (id, name, default_billable) VALUES ($1, $2, $3)", [
      category.id,
      category.name,
      category.defaultBillable ? 1 : 0,
    ]);
  }

  async update(id: UUID, name: string, defaultBillable: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE categories SET name = $1, default_billable = $2 WHERE id = $3",
      [name, defaultBillable ? 1 : 0, id]
    );
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM categories WHERE id = $1", [id]);
  }
}

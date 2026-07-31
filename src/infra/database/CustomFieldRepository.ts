import { getDb } from "./db";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { CustomField, CustomFieldOption, CustomFieldType } from "@domain/entities/CustomField";
import type { UUID } from "@shared/types";

interface CustomFieldRow {
  id: string;
  label: string;
  type: string;
  options: string;
  sort_order: number;
  archived: number;
  created_at: string;
}

function rowToField(r: CustomFieldRow): CustomField {
  return {
    id: r.id,
    label: r.label,
    type: r.type as CustomFieldType,
    options: JSON.parse(r.options) as CustomFieldOption[],
    sortOrder: r.sort_order,
    archived: r.archived === 1,
    createdAt: r.created_at,
  };
}

export class CustomFieldRepository implements ICustomFieldRepository {
  async findAll(): Promise<CustomField[]> {
    const db = await getDb();
    const rows = await db.select<CustomFieldRow[]>(
      "SELECT * FROM custom_fields ORDER BY sort_order ASC, created_at ASC"
    );
    return rows.map(rowToField);
  }

  async findById(id: UUID): Promise<CustomField | null> {
    const db = await getDb();
    const rows = await db.select<CustomFieldRow[]>("SELECT * FROM custom_fields WHERE id = $1", [
      id,
    ]);
    return rows[0] ? rowToField(rows[0]) : null;
  }

  async findByLabel(label: string): Promise<CustomField | null> {
    const db = await getDb();
    const rows = await db.select<CustomFieldRow[]>("SELECT * FROM custom_fields WHERE label = $1", [
      label,
    ]);
    return rows[0] ? rowToField(rows[0]) : null;
  }

  async save(field: CustomField): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO custom_fields (id, label, type, options, sort_order, archived, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        field.id,
        field.label,
        field.type,
        JSON.stringify(field.options),
        field.sortOrder,
        field.archived ? 1 : 0,
        field.createdAt,
      ]
    );
  }

  /** `type` não entra: mudar o tipo reinterpretaria todo valor já gravado. */
  async update(field: CustomField): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE custom_fields SET label = $1, options = $2, sort_order = $3, archived = $4
       WHERE id = $5`,
      [
        field.label,
        JSON.stringify(field.options),
        field.sortOrder,
        field.archived ? 1 : 0,
        field.id,
      ]
    );
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM custom_fields WHERE id = $1", [id]);
  }
}

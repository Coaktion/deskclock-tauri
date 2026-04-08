import { getDb } from "./db";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ExportProfile, ExportFormat, CsvSeparator, DurationFormat, DateFormat, ExportColumn } from "@domain/entities/ExportProfile";
import type { UUID } from "@shared/types";

interface ExportProfileRow {
  id: string;
  name: string;
  is_default: number;
  format: string;
  separator: string;
  duration_format: string;
  date_format: string;
  columns: string;
}

function rowToProfile(r: ExportProfileRow): ExportProfile {
  return {
    id: r.id,
    name: r.name,
    isDefault: r.is_default === 1,
    format: r.format as ExportFormat,
    separator: r.separator as CsvSeparator,
    durationFormat: r.duration_format as DurationFormat,
    dateFormat: r.date_format as DateFormat,
    columns: JSON.parse(r.columns) as ExportColumn[],
  };
}

export class ExportProfileRepository implements IExportProfileRepository {
  async findAll(): Promise<ExportProfile[]> {
    const db = await getDb();
    const rows = await db.select<ExportProfileRow[]>(
      "SELECT * FROM export_profiles ORDER BY is_default DESC, name ASC"
    );
    return rows.map(rowToProfile);
  }

  async findById(id: UUID): Promise<ExportProfile | null> {
    const db = await getDb();
    const rows = await db.select<ExportProfileRow[]>(
      "SELECT * FROM export_profiles WHERE id = $1", [id]
    );
    return rows[0] ? rowToProfile(rows[0]) : null;
  }

  async findDefault(): Promise<ExportProfile | null> {
    const db = await getDb();
    const rows = await db.select<ExportProfileRow[]>(
      "SELECT * FROM export_profiles WHERE is_default = 1 LIMIT 1"
    );
    return rows[0] ? rowToProfile(rows[0]) : null;
  }

  async save(profile: ExportProfile): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO export_profiles
        (id, name, is_default, format, separator, duration_format, date_format, columns)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        profile.id, profile.name, profile.isDefault ? 1 : 0,
        profile.format, profile.separator, profile.durationFormat,
        profile.dateFormat, JSON.stringify(profile.columns),
      ]
    );
  }

  async update(profile: ExportProfile): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE export_profiles SET
        name=$1, is_default=$2, format=$3, separator=$4,
        duration_format=$5, date_format=$6, columns=$7
       WHERE id=$8`,
      [
        profile.name, profile.isDefault ? 1 : 0,
        profile.format, profile.separator, profile.durationFormat,
        profile.dateFormat, JSON.stringify(profile.columns), profile.id,
      ]
    );
  }

  async setDefault(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE export_profiles SET is_default = 0");
    await db.execute("UPDATE export_profiles SET is_default = 1 WHERE id = $1", [id]);
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM export_profiles WHERE id = $1", [id]);
  }
}

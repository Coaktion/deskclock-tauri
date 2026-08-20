import { getDb } from "./db";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type {
  ExportProfile,
  ExportFormat,
  CsvSeparator,
  DurationFormat,
  DateFormat,
  ExportColumn,
} from "@domain/entities/ExportProfile";
import type { UUID } from "@shared/types";

interface ExportProfileRow {
  id: string;
  workspace_id: string;
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
    workspaceId: r.workspace_id,
    name: r.name,
    isDefault: r.is_default === 1,
    // Legacy profiles may hold the discontinued "xlsx" format; coerce to csv.
    format: (r.format === "xlsx" ? "csv" : r.format) as ExportFormat,
    separator: r.separator as CsvSeparator,
    durationFormat: r.duration_format as DurationFormat,
    dateFormat: r.date_format as DateFormat,
    columns: JSON.parse(r.columns) as ExportColumn[],
  };
}

export class ExportProfileRepository implements IExportProfileRepository {
  async findAll(workspaceId?: UUID): Promise<ExportProfile[]> {
    const db = await getDb();
    const rows = workspaceId
      ? await db.select<ExportProfileRow[]>(
          "SELECT * FROM export_profiles WHERE workspace_id = $1 ORDER BY is_default DESC, name ASC",
          [workspaceId]
        )
      : await db.select<ExportProfileRow[]>(
          "SELECT * FROM export_profiles ORDER BY is_default DESC, name ASC"
        );
    return rows.map(rowToProfile);
  }

  async findById(id: UUID): Promise<ExportProfile | null> {
    const db = await getDb();
    const rows = await db.select<ExportProfileRow[]>(
      "SELECT * FROM export_profiles WHERE id = $1",
      [id]
    );
    return rows[0] ? rowToProfile(rows[0]) : null;
  }

  async findDefault(workspaceId: UUID): Promise<ExportProfile | null> {
    const db = await getDb();
    const rows = await db.select<ExportProfileRow[]>(
      "SELECT * FROM export_profiles WHERE is_default = 1 AND workspace_id = $1 LIMIT 1",
      [workspaceId]
    );
    return rows[0] ? rowToProfile(rows[0]) : null;
  }

  async save(profile: ExportProfile): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO export_profiles
        (id, workspace_id, name, is_default, format, separator, duration_format, date_format, columns)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        profile.id,
        profile.workspaceId,
        profile.name,
        profile.isDefault ? 1 : 0,
        profile.format,
        profile.separator,
        profile.durationFormat,
        profile.dateFormat,
        JSON.stringify(profile.columns),
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
        profile.name,
        profile.isDefault ? 1 : 0,
        profile.format,
        profile.separator,
        profile.durationFormat,
        profile.dateFormat,
        JSON.stringify(profile.columns),
        profile.id,
      ]
    );
  }

  /**
   * O padrão é único **por workspace** (índice parcial criado na migration 011).
   * A limpeza precisa ser escopada ao workspace do perfil: um `UPDATE` global
   * apagaria o padrão dos outros workspaces.
   */
  async setDefault(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE export_profiles SET is_default = 0
       WHERE workspace_id = (SELECT workspace_id FROM export_profiles WHERE id = $1)`,
      [id]
    );
    await db.execute("UPDATE export_profiles SET is_default = 1 WHERE id = $1", [id]);
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM export_profiles WHERE id = $1", [id]);
  }
}

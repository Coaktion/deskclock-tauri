import { getDb } from "./db";
import type { IDaySummaryRepository } from "@domain/repositories/IDaySummaryRepository";
import type { DaySummary } from "@domain/entities/DaySummary";
import type { UUID } from "@shared/types";

interface DaySummaryRow {
  day: string;
  workspace_id: string;
  summary: string;
  generated_at: string;
}

function rowToDaySummary(r: DaySummaryRow): DaySummary {
  return {
    dateISO: r.day,
    workspaceId: r.workspace_id,
    summary: r.summary,
    generatedAt: r.generated_at,
  };
}

export class DaySummaryRepository implements IDaySummaryRepository {
  async findByDays(workspaceId: UUID, dateISOs: string[]): Promise<DaySummary[]> {
    if (dateISOs.length === 0) return [];
    const db = await getDb();
    const placeholders = dateISOs.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await db.select<DaySummaryRow[]>(
      `SELECT day, workspace_id, summary, generated_at
         FROM day_summaries
        WHERE workspace_id = $1 AND day IN (${placeholders})`,
      [workspaceId, ...dateISOs]
    );
    return rows.map(rowToDaySummary);
  }

  async save(summary: DaySummary): Promise<void> {
    const db = await getDb();
    // `INSERT OR REPLACE` sobre a PK (dia, workspace): quem chega aqui pediu a
    // geração, e o texto novo é o que ele quer ver no lugar do antigo.
    await db.execute(
      `INSERT OR REPLACE INTO day_summaries (day, workspace_id, summary, generated_at)
       VALUES ($1, $2, $3, $4)`,
      [summary.dateISO, summary.workspaceId, summary.summary, summary.generatedAt]
    );
  }
}

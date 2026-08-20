import type { TrackedMondayItem } from "./TrackedMondayItem";
import type { UUID } from "@shared/types";

/**
 * Persistência do vínculo item do Monday ↔ tarefa planejada. Implementada em
 * `infra/` (SQLite). A identidade do Monday fica confinada a este store — as
 * entidades núcleo permanecem agnósticas à integração.
 */
export interface ITrackedMondayItemRepository {
  /** Vínculos de um workspace do DeskClock. */
  listForWorkspace(workspaceId: UUID): Promise<TrackedMondayItem[]>;
  /** Insere ou atualiza por (mondayItemId, workspaceId). */
  upsert(item: TrackedMondayItem): Promise<void>;
  /** Remove o vínculo — usado quando o item some do board. */
  remove(mondayItemId: string, workspaceId: UUID): Promise<void>;
}

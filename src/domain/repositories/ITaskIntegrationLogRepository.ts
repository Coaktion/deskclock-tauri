import type { UUID } from "@shared/types";

export interface ITaskIntegrationLogRepository {
  markSent(taskIds: UUID[], integration: string): Promise<void>;
  findSentIds(integration: string, startISO?: string, endISO?: string): Promise<UUID[]>;
}

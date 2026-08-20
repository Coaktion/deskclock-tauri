import type { UUID } from "@shared/types";

export interface Category {
  id: UUID;
  workspaceId: UUID;
  name: string;
  defaultBillable: boolean;
}

import type { UUID } from "@shared/types";

export interface Project {
  id: UUID;
  workspaceId: UUID;
  name: string;
}

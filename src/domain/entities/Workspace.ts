import type { UUID } from "@shared/types";

export interface Workspace {
  id: UUID;
  name: string;
  /** Slot da paleta de tokens (nunca um valor de cor literal). */
  color: string;
  createdAt: string;
}

/**
 * Workspace "Padrão" semeado pela migration 011, dono de todo o legado.
 * O mesmo literal está em `src-tauri/migrations/011_workspaces.sql` — as duas
 * pontas precisam mudar juntas.
 */
export const DEFAULT_WORKSPACE_ID: UUID = "00000000-0000-4000-8000-000000000001";

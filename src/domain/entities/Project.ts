import type { UUID } from "@shared/types";

export interface Project {
  id: UUID;
  workspaceId: UUID;
  name: string;
  /**
   * Slot da paleta de cores, atribuído na criação e nunca derivado do id nem do
   * nome — é o que faz dois projetos do mesmo workspace não compartilharem cor
   * enquanto houver slot livre. Cru, sem teto: quem passa do fim da paleta dá a
   * volta na apresentação. Ver `nextProjectColorIndex`.
   */
  colorIndex: number;
}

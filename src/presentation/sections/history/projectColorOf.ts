import type { Project } from "@domain/entities/Project";
import { getProjectColor } from "@shared/utils/projectColor";

/**
 * A cor de projeto sai da entidade, e três blocos do Histórico só têm o id em
 * mão — a linha do dia, a linha do tempo e a distribuição. Id que não está no
 * catálogo (projeto excluído) devolve `undefined` e cai no cinza de "sem
 * projeto", que é o mesmo destino do "—" que a distribuição já mostra.
 */
export function projectColorOf(projects: Project[], projectId: string | null | undefined) {
  return getProjectColor(projects.find((p) => p.id === projectId));
}

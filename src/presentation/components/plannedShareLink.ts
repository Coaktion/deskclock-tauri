import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { plannedTaskToSharePayload } from "@domain/utils/sharePayload";
import { buildShareLink } from "@shared/utils/shareLink";
import { showToast } from "@shared/utils/toast";

/**
 * O "Copiar link" da planejada: monta o deeplink e o põe na área de
 * transferência, com o toast do resultado. Mora aqui porque a linha do
 * Planejamento e a do popup o faziam cada uma à sua cópia.
 *
 * `customFields` é o catálogo inteiro, arquivados inclusive: o link traduz id de
 * campo em rótulo, e valor gravado num campo arquivado continua valendo.
 */
export async function copyPlannedTaskLink(
  task: PlannedTask,
  projects: Project[],
  categories: Category[],
  customFields: CustomField[]
): Promise<void> {
  const link = buildShareLink(plannedTaskToSharePayload(task, projects, categories, customFields));
  try {
    await navigator.clipboard.writeText(link);
    await showToast("success", "Link copiado para a área de transferência.");
  } catch {
    await showToast("error", "Não foi possível copiar o link.");
  }
}

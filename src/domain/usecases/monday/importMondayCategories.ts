import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { createCategory } from "@domain/usecases/categories/CreateCategory";

export interface ImportMondayCategoriesInput {
  categoryRepo: ICategoryRepository;
  /** Mapeamentos do workspace Monday ativo — deles saem os rótulos cacheados. */
  mappings: MondayProjectMapping[];
  /** Board da pasta interna; seus Activity Types nascem non-billable. */
  internalBoardId?: string;
  /** Workspace do **DeskClock** que recebe as categorias. */
  deskclockWorkspaceId: string;
}

export interface ImportMondayCategoriesResult {
  created: string[];
  /** Já existiam no workspace; o billable escolhido pelo usuário é preservado. */
  existing: string[];
}

/**
 * Cria uma Categoria por Activity Type dos boards importados.
 *
 * Não existe tabela de mapeamento: a categoria **é** o rótulo, e o envio casa os
 * dois pelo nome. Por isso o nome não é normalizado nem traduzido aqui — mudá-lo
 * silenciosamente quebraria o envio sem nenhum sintoma na tela.
 *
 * O padrão de cobrança vem da pasta: cliente é billable, interno é non-billable.
 * Um rótulo presente nos dois lados fica **billable**, porque o trabalho de
 * cliente é o caso majoritário e `default_billable` é só um padrão — o usuário
 * troca no card da tarefa.
 */
export async function importMondayCategories({
  categoryRepo,
  mappings,
  internalBoardId,
  deskclockWorkspaceId,
}: ImportMondayCategoriesInput): Promise<ImportMondayCategoriesResult> {
  const billableByLabel = new Map<string, boolean>();

  for (const mapping of mappings) {
    if (mapping.mondayBoardId !== internalBoardId) continue;
    for (const label of mapping.activityTypeLabels) billableByLabel.set(label.trim(), false);
  }
  for (const mapping of mappings) {
    if (mapping.mondayBoardId === internalBoardId) continue;
    for (const label of mapping.activityTypeLabels) billableByLabel.set(label.trim(), true);
  }

  const created: string[] = [];
  const existing: string[] = [];

  for (const [label, billable] of billableByLabel) {
    if (!label) continue;
    if (await categoryRepo.findByName(label, deskclockWorkspaceId)) {
      existing.push(label);
      continue;
    }
    await createCategory(categoryRepo, label, billable, deskclockWorkspaceId);
    created.push(label);
  }

  return { created, existing };
}

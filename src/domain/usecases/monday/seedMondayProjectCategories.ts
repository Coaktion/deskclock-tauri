import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import type { UUID } from "@shared/types";

export interface SeedMondayProjectCategoriesInput {
  /** Saída de `importMondayProjects`, com os rótulos já cacheados por board. */
  mappings: MondayProjectMapping[];
  categoryRepo: ICategoryRepository;
  projectCategoryRepo: IProjectCategoryRepository;
  /** Workspace do DeskClock da integração — é onde os projetos nasceram. */
  workspaceId: UUID;
}

export interface SeedMondayProjectCategoriesResult {
  /** Associações gravadas, somando todos os projetos. */
  seeded: number;
  /** Projetos que receberam associação. */
  projects: number;
}

/**
 * Associa a cada projeto do Monday as categorias que o board dele aceita.
 *
 * O board de destino já publica os Activity Types válidos, e o Activity Type
 * **é** o nome da Categoria (não há tabela de mapeamento, § Monday). Então a
 * associação não custa nenhuma consulta nova: os rótulos vieram no
 * `activityTypeLabels` do próprio import.
 *
 * Fica **fora** de `importMondayProjects` de propósito. Aquele use case já lê o
 * Portfólio, cria projetos e resolve o schema de 62 boards; juntar a escrita das
 * associações lhe daria dois repositórios a mais e uma segunda razão para mudar.
 * Os dois gatilhos — o botão "Atualizar" e a varredura diária — chamam os dois
 * em sequência.
 *
 * **Board sem rótulo nenhum é pulado, não zerado.** `activityTypeLabels` vazio
 * significa board ilegível ou projeto sem destino (14 dos 62 hoje), não "este
 * projeto não aceita categoria nenhuma": chamar `replaceMondayFor` com lista
 * vazia apagaria as associações a cada falha de leitura. É a mesma regra do "ID
 * Quadro Projeto", onde vazio nunca sobrescreve o local.
 *
 * **Rótulo sem categoria correspondente é ignorado em silêncio.** Quem cria
 * categoria a partir do Monday é `importMondayCategories`, que pode não ter
 * rodado ainda — criar aqui duplicaria a regra de billable por escopo.
 */
export async function seedMondayProjectCategories({
  mappings,
  categoryRepo,
  projectCategoryRepo,
  workspaceId,
}: SeedMondayProjectCategoriesInput): Promise<SeedMondayProjectCategoriesResult> {
  const categories = await categoryRepo.findAll(workspaceId);
  const idByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  let seeded = 0;
  let projects = 0;

  for (const mapping of mappings) {
    if (mapping.activityTypeLabels.length === 0) continue;

    const categoryIds = [
      ...new Set(
        mapping.activityTypeLabels.flatMap((label) => {
          const id = idByName.get(label.trim().toLowerCase());
          return id ? [id] : [];
        })
      ),
    ];
    if (categoryIds.length === 0) continue;

    await projectCategoryRepo.replaceMondayFor(mapping.deskclockProjectId, categoryIds);
    seeded += categoryIds.length;
    projects += 1;
  }

  return { seeded, projects };
}

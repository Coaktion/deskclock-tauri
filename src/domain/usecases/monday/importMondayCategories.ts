import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { mergeLabels } from "./importMondayFieldCatalogs";

export interface ImportMondayCategoriesInput {
  categoryRepo: ICategoryRepository;
  /**
   * Activity Types do board de Report — o catálogo canônico, onde os rótulos de
   * cliente e os de projeto interno convivem (35 hoje). Vazio antes da primeira
   * leitura dos catálogos, e aí valem só os rótulos cacheados nos mapeamentos.
   */
  catalogLabels?: string[];
  /**
   * Projetos importados. Deles sai o **escopo** de cada rótulo: um board de
   * cliente e um interno bastam para separar os dois conjuntos, e os dois já
   * estão cacheados aqui desde o import dos projetos.
   */
  mappings: MondayProjectMapping[];
  /** Workspace do **DeskClock** que recebe as categorias. */
  deskclockWorkspaceId: string;
}

export interface ImportMondayCategoriesResult {
  created: string[];
  /** Já existiam no workspace; o billable escolhido pelo usuário é preservado. */
  existing: string[];
}

/**
 * Padrão de cobrança de cada Activity Type, pelo escopo dos boards em que ele
 * aparece.
 *
 * Cliente é billable, interno é non-billable — nos 119 itens do board de Report,
 * projeto interno não tem uma hora faturável sequer. Rótulo presente nos **dois**
 * lados fica billable, porque o trabalho de cliente é o caso majoritário; só
 * `N-A` é comum aos dois conjuntos hoje.
 *
 * O cruzamento sai dos mapeamentos e não de uma consulta nova: o import dos
 * projetos já cacheou os rótulos da coluna Activity Type de cada board, junto do
 * escopo que a coluna "Oferta" do Portfólio classificou.
 */
export function billableByActivityType(mappings: MondayProjectMapping[]): Map<string, boolean> {
  const billableByLabel = new Map<string, boolean>();

  for (const mapping of mappings) {
    if (mapping.scope !== "interno") continue;
    for (const label of mapping.activityTypeLabels) billableByLabel.set(label.trim(), false);
  }
  for (const mapping of mappings) {
    if (mapping.scope === "interno") continue;
    for (const label of mapping.activityTypeLabels) billableByLabel.set(label.trim(), true);
  }

  return billableByLabel;
}

/**
 * Todos os Activity Types que viram Categoria.
 *
 * É a **união** do catálogo do board de Report com os rótulos cacheados nos
 * boards de projeto, e as duas metades cobrem buracos diferentes: o catálogo traz
 * rótulo de board que ainda não foi importado (ou cujo board não abre), e o cache
 * traz rótulo que existe num board de projeto e não está no Report. O envio
 * valida contra a coluna do board de destino, então rótulo a mais aqui custa uma
 * categoria não usada — rótulo a menos custa a coluna Activity Type em branco no
 * apontamento.
 *
 * Exportada porque a tela conta o que o botão vai criar: com a regra em dois
 * lugares, o número exibido e o resultado do clique divergiriam em silêncio.
 */
export function activityTypeCatalog(
  catalogLabels: string[],
  mappings: MondayProjectMapping[]
): string[] {
  return mergeLabels(
    catalogLabels,
    mappings.flatMap((m) => m.activityTypeLabels)
  );
}

/**
 * Cria uma Categoria por Activity Type.
 *
 * Não existe tabela de mapeamento: a categoria **é** o rótulo, e o envio casa os
 * dois pelo nome. Por isso o nome não é normalizado nem traduzido aqui — mudá-lo
 * silenciosamente quebraria o envio sem nenhum sintoma na tela.
 */
export async function importMondayCategories({
  categoryRepo,
  catalogLabels = [],
  mappings,
  deskclockWorkspaceId,
}: ImportMondayCategoriesInput): Promise<ImportMondayCategoriesResult> {
  const billableByLabel = billableByActivityType(mappings);
  const labels = activityTypeCatalog(catalogLabels, mappings);

  const created: string[] = [];
  const existing: string[] = [];

  for (const label of labels) {
    // Rótulo que o catálogo tem e nenhum board confirmou nasce **billable**: é o
    // caso majoritário, e `default_billable` é só um padrão — quem trabalha numa
    // hora interna troca no card da tarefa.
    const billable = billableByLabel.get(label) ?? true;
    if (await categoryRepo.findByName(label, deskclockWorkspaceId)) {
      existing.push(label);
      continue;
    }
    await createCategory(categoryRepo, label, billable, deskclockWorkspaceId);
    created.push(label);
  }

  return { created, existing };
}

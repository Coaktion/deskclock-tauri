import type { MondayProjectMapping } from "@shared/types/mondayConfig";

/**
 * Preenche os campos que um mapeamento gravado por uma versão anterior não tem.
 *
 * `mondayProjectMapping` é JSON na tabela `config`: o `DEFAULTS` do
 * `ConfigContext` completa **chaves** ausentes, mas não olha dentro do array —
 * um vínculo criado antes do cache de rótulos volta sem eles e o tipo mente
 * sobre isso. Ler direto derrubou a página de integrações inteira
 * (`projectStageLabels.length` de `undefined`).
 *
 * O default é lista vazia, e não "manda assim mesmo": rótulo desconhecido faz o
 * Monday recusar a escrita. Reimportar os projetos repovoa o cache.
 */
export function normalizeProjectMappings(
  mappings: MondayProjectMapping[] | undefined
): MondayProjectMapping[] {
  return (mappings ?? []).map((mapping) => ({
    ...mapping,
    activityTypeLabels: mapping.activityTypeLabels ?? [],
    projectStageLabels: mapping.projectStageLabels ?? [],
    projectStageTitle: mapping.projectStageTitle ?? "",
  }));
}

import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { DEFAULT_REPORT_TYPE } from "./resolveBoardActivitiesColumns";

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
 *
 * **`scope` ausente vira `cliente`**, e não uma terceira opção "desconhecido":
 * é a maioria (56 dos 62 itens do Portfólio) e é o palpite que erra alto.
 * Chutando `interno` num projeto de cliente, o Project Stage some do payload e
 * a hora sobe incompleta sem nada na tela; chutando `cliente` num interno, o
 * rótulo estranho à coluna faz o Monday recusar a mutation e o erro aparece.
 * De todo modo é provisório: a varredura diária reescreve a lista inteira com
 * o escopo lido da coluna "Oferta".
 */
export function normalizeProjectMappings(
  mappings: MondayProjectMapping[] | undefined
): MondayProjectMapping[] {
  return (mappings ?? []).map((mapping) => ({
    ...mapping,
    portfolioItemId: mapping.portfolioItemId ?? "",
    scope: mapping.scope ?? "cliente",
    activityTypeLabels: mapping.activityTypeLabels ?? [],
    projectStageLabels: mapping.projectStageLabels ?? [],
    projectStageTitle: mapping.projectStageTitle ?? "",
    nonBillableReasonLabels: mapping.nonBillableReasonLabels ?? [],
    // Vínculo gravado antes do roteamento por Report Type conhece só o
    // Activities. Cair no grupo já gravado mantém o envio de pé até a próxima
    // varredura — sem isso, todo projeto anterior recusaria o `Activity` que é
    // o padrão de toda tarefa, e o envio pararia inteiro.
    reportTypeGroupIds: mapping.reportTypeGroupIds ?? {
      [DEFAULT_REPORT_TYPE]: mapping.activitiesGroupId,
    },
  }));
}

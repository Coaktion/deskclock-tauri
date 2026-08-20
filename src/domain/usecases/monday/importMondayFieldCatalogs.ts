import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayColumn } from "@shared/types/monday";
import type { MondayFieldCatalogs } from "@shared/types/mondayConfig";
import { DomainError } from "@shared/errors";
import { parseStatusLabels } from "./resolveBoardActivitiesColumns";

/**
 * Colunas do board de Report de Horas, hardcodadas pelo mesmo motivo do
 * Portfólio: é **um board só**, escolhido por id na configuração. O resto da
 * integração resolve coluna por título porque os boards de projeto nascem de um
 * template e cada um gera os seus ids — aqui não há variação a acomodar, e
 * resolver por título só criaria a chance de casar com a coluna errada num board
 * que tem quatro outras colunas `status` e três outras `dropdown`.
 */
export const REPORT_CATALOG_COLUMN_IDS = {
  activityType: "color_mm3ar35x",
  projectStage: "color_mm3ajr7s",
  nonBillableReason: "dropdown_mm3a3dgg",
  reportType: "color_mm3ajdce",
} as const;

interface RawDropdownSettings {
  labels?: { id?: number; name?: string; label?: string }[];
  deactivated_labels?: number[];
}

/**
 * Rótulos de uma coluna `dropdown`.
 *
 * Existe separado de `parseStatusLabels` porque o formato é **outro**: `status`
 * guarda `{"labels":{"0":"Rótulo"}}` e `dropdown` guarda
 * `{"labels":[{"id":1,"name":"Rótulo"}]}`. Passar um pelo parser do outro
 * devolve lista vazia sem erro nenhum — a integração seguiria em pé mostrando
 * zero opções, que é o pior desfecho possível para um catálogo.
 *
 * Rótulo desativado fica de fora: ele não pode ser escrito na coluna, e valor
 * inválido faz o Monday recusar a mutation inteira.
 */
export function parseDropdownLabels(column: MondayColumn | undefined): string[] {
  if (!column?.settingsStr) return [];
  try {
    const parsed = JSON.parse(column.settingsStr) as RawDropdownSettings;
    const deactivated = new Set(parsed.deactivated_labels ?? []);
    return (
      (parsed.labels ?? [])
        .filter((l) => l.id === undefined || !deactivated.has(l.id))
        // `name` é o que a API devolve hoje; `label` é como o mesmo campo aparece
        // nas respostas normalizadas, e cai aqui se a versão da API mudar.
        .map((l) => (l.name ?? l.label ?? "").trim())
        .filter((l) => l.length > 0)
    );
  } catch {
    return [];
  }
}

/**
 * União de listas de rótulos, aparada e sem repetição, na ordem em que aparecem.
 *
 * Os rótulos chegam de duas origens que se completam — o catálogo do board de
 * Report e o cache de cada board de projeto — e as duas cobrem buracos
 * diferentes. Aparar é o que faz `"Development"` e `" Development "` contarem
 * como um só: do lado DeskClock todo mundo apara, então o par sobreviveria aqui
 * para virar duas categorias e uma delas nunca casaria com a coluna do Monday.
 */
export function mergeLabels(...lists: string[][]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const label = raw.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      merged.push(label);
    }
  }
  return merged;
}

export interface ImportMondayFieldCatalogsInput {
  api: IMondayApi;
  /** Board "Report de Horas" (`mondayReportBoardId`). */
  reportBoardId: string;
}

/**
 * Lê os quatro catálogos de rótulos do board de Report numa consulta só.
 *
 * Uma leitura, não quatro: o schema do board já traz todas as colunas com o
 * `settings_str`, e é dele que saem os 35 Activity Types, os 18 Project Stages,
 * os 8 motivos de non-billable e os 5 Report Types.
 *
 * Coluna que não existe vira catálogo **vazio** em vez de erro. O board é
 * configurável (outra conta troca o id), e recusar a leitura inteira porque um
 * dos quatro sumiu deixaria sem semente os outros três, que estão lá.
 */
export async function importMondayFieldCatalogs({
  api,
  reportBoardId,
}: ImportMondayFieldCatalogsInput): Promise<MondayFieldCatalogs> {
  if (!reportBoardId) {
    throw new DomainError("Informe o id do board de Report de Horas em Integrações.");
  }

  const schema = await api.getBoardSchema(reportBoardId);
  const column = (id: string) => schema.columns.find((c) => c.id === id);

  return {
    activityType: parseStatusLabels(column(REPORT_CATALOG_COLUMN_IDS.activityType)),
    projectStage: parseStatusLabels(column(REPORT_CATALOG_COLUMN_IDS.projectStage)),
    nonBillableReason: parseDropdownLabels(column(REPORT_CATALOG_COLUMN_IDS.nonBillableReason)),
    reportType: parseStatusLabels(column(REPORT_CATALOG_COLUMN_IDS.reportType)),
  };
}

import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { findTimelineColumnId } from "./resolveBoardActivitiesColumns";

/**
 * Id da coluna de cronograma planejado de cada board, para o import de itens.
 *
 * **O caminho normal não fala com o Monday.** O id sai do
 * `mondayProjectMapping`, gravado pela varredura de projetos, que já lê o schema
 * de cada board para resolver grupo, colunas e rótulos. Antes, tanto o ciclo
 * automático quanto o modal liam o schema de **todos** os boards mapeados a cada
 * execução só para extrair este id — a requisição mais cara da integração
 * (todas as colunas e todas as views, com `settings_str`, de boards de 60+
 * colunas), repetida para descobrir um dado que já estava do lado de cá.
 *
 * A leitura sobrevive como **recurso do que não tem cache**: vínculo gravado por
 * uma versão anterior e board que não abriu na última varredura. Só esses vão na
 * consulta, e quando não há nenhum, não há consulta — que é o caso depois da
 * primeira varredura.
 *
 * `""` no cache significa "board sem coluna de cronograma" e vira `undefined` no
 * mapa, que é como o resto do import lê a ausência (§ `MondayProjectMapping`).
 * Não confundir com o `undefined` de entrada, que significa "ainda não sei" — é
 * a distinção que decide quem vai à rede.
 */
export async function resolveTimelineByBoard(
  api: IMondayApi,
  mappings: MondayProjectMapping[]
): Promise<Map<string, string | undefined>> {
  const byBoard = new Map<string, string | undefined>();
  const unresolved = new Set<string>();

  for (const mapping of mappings) {
    if (!mapping.mondayBoardId) continue;
    if (mapping.timelineColumnId === undefined) unresolved.add(mapping.mondayBoardId);
    else byBoard.set(mapping.mondayBoardId, mapping.timelineColumnId || undefined);
  }

  if (unresolved.size === 0) return byBoard;

  const schemas = await api.listBoardSchemas([...unresolved]);
  for (const schema of schemas) byBoard.set(schema.id, findTimelineColumnId(schema));
  return byBoard;
}

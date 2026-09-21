/**
 * Formato do cache de `mondayProjectMapping`.
 *
 * O mapeamento não guarda só o vínculo projeto↔board: ele é o **cache do schema**
 * de cada board (grupo, colunas, views, rótulos). Quando esse cache ganha campo
 * novo, os vínculos já gravados ficam sem ele, e quem decide reler é o
 * `shouldReadBoardSchema` — mas a releitura só acontece dentro da varredura de
 * projetos, que passa por um portão de **uma vez por dia**. No dia em que o
 * usuário atualiza o app com a varredura já feita, o campo novo só chegaria na
 * virada do dia; até lá o envio roda com o mapeamento velho, calado.
 *
 * Esta constante fecha essa janela: gravada na config depois de cada migração
 * bem-sucedida, a diferença entre o que está gravado e o valor daqui dispara
 * **uma** varredura forçada, e só uma.
 *
 * **Bumpar a constante é o procedimento quando o cache do mapeamento ganha campo
 * novo** — é o único lugar a mexer. Não é a versão do app: amarrada à release, ela
 * forçaria uma varredura a cada publicação sem nada de novo para ler.
 *
 * Histórico: `0` — ausente, que é como todo vínculo anterior a esta chave volta
 * da config — é o mapeamento sem `statusLabels`. O `2` acrescentou os rótulos da
 * coluna Status, sem os quais o envio nasce com o rótulo padrão do board. O `1`
 * nunca foi gravado por build nenhum: a numeração começa no 2 porque a primeira
 * migração é a que ela descreve.
 */
export const MONDAY_MAPPING_CACHE_VERSION = 2;

export interface MondayMappingCacheMigrationState {
  /** Versão gravada na config. Ausente/0 = mapeamento anterior a esta migração. */
  storedVersion: number;
  /**
   * `MONDAY_MAPPING_CACHE_VERSION` na produção; recebido em vez de importado
   * para o teste fixar o valor e continuar descrevendo "atrás", "igual" e "à
   * frente" depois que a constante for bumpada.
   */
  currentVersion: number;
  apiKey: string;
  /** Board de onde a lista de projetos é lida. Sem ele não há o que reler. */
  portfolioBoardId: string;
}

/**
 * Se o cache do mapeamento precisa de uma releitura forçada agora.
 *
 * É **estritamente menor**, não diferente: quem voltou para um build antigo tem
 * gravada uma versão à frente da que o build conhece, e o cache dele já contém
 * tudo o que esse build sabe ler. Tratar isso como migração devida gastaria uma
 * varredura forçada a cada abertura, para sempre.
 *
 * A condição é a versão, e não os dados ("algum vínculo sem `statusLabels`"), de
 * propósito: board que não abre nunca preencheria o campo, e a condição derivada
 * ficaria verdadeira para sempre — varredura a cada 30 minutos.
 */
export function shouldMigrateMondayMappingCache({
  storedVersion,
  currentVersion,
  apiKey,
  portfolioBoardId,
}: MondayMappingCacheMigrationState): boolean {
  if (!apiKey || !portfolioBoardId) return false;
  return storedVersion < currentVersion;
}

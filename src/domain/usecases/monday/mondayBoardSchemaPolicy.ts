import type { MondayProjectMapping } from "@shared/types/mondayConfig";

/**
 * Por quantos dias o schema cacheado de um board vale.
 *
 * A topologia de um board nascido de template não muda: grupo, colunas e views
 * são os mesmos do dia em que o board foi criado. O que muda de vez em quando são
 * os **rótulos** — Activity Type novo, etapa nova, motivo novo —, e é só por eles
 * que existe validade em vez de cache eterno.
 *
 * **O vencimento não é escalonado entre os boards, de propósito.** Espalhar para
 * "não vencerem todos no mesmo dia" sairia mais caro: o `MondayClient` quebra a
 * leitura em lotes de 20, então 46 boards vencendo juntos custam 3 requisições
 * **uma vez por semana**, enquanto ~7 por dia custariam uma requisição **todo
 * dia**. E o pior dia sem escalonamento é exatamente o que a varredura custava
 * todo dia antes deste cache.
 */
export const BOARD_SCHEMA_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BoardSchemaReadState {
  /** Board que vai ser o destino das horas deste projeto agora. */
  boardId: string;
  /**
   * Vínculo já gravado do mesmo item de Portfólio. Ausente = projeto que aparece
   * pela primeira vez, e não há cache nenhum de que falar.
   */
  cached?: Pick<MondayProjectMapping, "mondayBoardId" | "schemaReadAtISO">;
  nowISO: string;
  /** O clique em "Atualizar": a intenção explícita ignora a validade. */
  force?: boolean;
}

/**
 * Se o schema deste board precisa ser lido no Monday nesta varredura.
 *
 * É a requisição mais cara da integração — todas as colunas e todas as views,
 * com `settings_str`, de boards de 60+ colunas — e o mapeamento já é um cache do
 * que ela devolve (grupos, colunas, rótulos, `timelineColumnId`). O que faltava
 * era marca de validade: sem ela, a varredura diária não distinguia board novo de
 * board lido há uma hora, e relia os ~46 todo dia.
 *
 * Relê quando: o vínculo é novo, o board de destino mudou (inclusive o id
 * digitado à mão), a marca não existe (vínculo de uma versão anterior a este
 * cache, ou leitura que falhou) ou ela venceu.
 *
 * **Marca inválida relê.** `Date.parse` de lixo devolve `NaN`, e comparação com
 * `NaN` é sempre falsa: sem o teste explícito, uma marca corrompida no JSON da
 * config congelaria aquele board no cache para sempre.
 */
export function shouldReadBoardSchema({
  boardId,
  cached,
  nowISO,
  force,
}: BoardSchemaReadState): boolean {
  // Projeto sem quadro é estado normal (14 dos 62 itens do Portfólio): não há
  // board a ler, e nem `force` inventa um.
  if (!boardId) return false;
  if (force) return true;
  if (!cached || cached.mondayBoardId !== boardId) return true;
  if (!cached.schemaReadAtISO) return true;

  const readAt = Date.parse(cached.schemaReadAtISO);
  const now = Date.parse(nowISO);
  if (Number.isNaN(readAt) || Number.isNaN(now)) return true;
  return now - readAt >= BOARD_SCHEMA_TTL_DAYS * DAY_MS;
}

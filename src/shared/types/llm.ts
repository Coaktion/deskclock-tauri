/**
 * O que o provedor disse sobre a cota, nos cabeçalhos `x-ratelimit-*` da
 * resposta. Todo campo é opcional: **nem todo provedor os manda**, e ausente é
 * ausente — não se estima limite a partir do que veio.
 *
 * **O período de cada balde não é afirmado, e é deliberado.** Os cabeçalhos têm
 * o mesmo nome em todo provedor e medem janelas diferentes: no Groq
 * `limit-requests` é por **dia** e `limit-tokens` é por **minuto**; na OpenAI
 * `limit-requests` é por **minuto**. Escrever "restam 312 de 1000 requisições
 * hoje" seria falso para metade dos onze presets, e uma tabela nossa de janelas
 * por provedor envelheceria calada. Por isso os dois `reset` são guardados como
 * **texto cru do provedor** (`2m59.56s`, `7.66s`): é ele que diz quando o balde
 * vira, sem nos obrigar a nomear a janela.
 */
export interface LlmRateLimits {
  requestsLimit?: number;
  requestsRemaining?: number;
  /** Texto de renovação do provedor, não reinterpretado — `2m59.56s`. */
  requestsReset?: string;
  tokensLimit?: number;
  tokensRemaining?: number;
  /** Texto de renovação do provedor, não reinterpretado — `7.66s`. */
  tokensReset?: string;
}

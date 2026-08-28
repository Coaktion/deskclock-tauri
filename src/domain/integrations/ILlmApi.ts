import type { LlmRateLimits } from "@shared/types/llm";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * O texto da resposta **e** o que o provedor disse sobre a cota ao respondê-la.
 *
 * Os dois vêm juntos porque a cota só se conhece fazendo a chamada: não há
 * endpoint gratuito que a informe, e o `GET /models` não serve — ele não é
 * específico de modelo, e os cabeçalhos dele podem descrever outro balde.
 */
export interface LlmCompletion {
  text: string;
  limits?: LlmRateLimits;
}

/**
 * O que muda de uma chamada para a outra. Hoje só o teto de saída.
 *
 * **Ele é da chamada, não do provedor.** O parágrafo do resumo cabe em 220
 * tokens; um plano de semana em JSON não cabe. Os dois falam com o mesmo
 * adapter, então um teto fixo no preset serviria a um e truncaria o outro — e
 * truncado o provedor devolve `finish_reason: "length"`, que o adapter mapeia
 * para resposta vazia: a tela pediria "tente novamente" para algo que nunca
 * passaria.
 *
 * O **nome** do parâmetro continua sendo do provedor (`outputTokensParam`, no
 * catálogo de presets) — `max_tokens` devolve 400 na família gpt-5, que só
 * conhece `max_completion_tokens`. Aqui só existe a intenção, que é o que
 * `domain/` pode ter.
 */
export interface LlmCompleteOptions {
  /** Teto de tokens da resposta. Ausente = o provedor decide, como sempre decidiu. */
  maxOutputTokens?: number;
}

export interface ILlmApi {
  /** Uma completação de chat; devolve o texto da resposta e a cota medida nela. */
  complete(messages: LlmMessage[], options?: LlmCompleteOptions): Promise<LlmCompletion>;
  /** Ids de modelo disponíveis. Usado para validar a chave e preencher o seletor. */
  listModels(): Promise<string[]>;
}

/**
 * O `name` com que o adapter marca o erro de limite de cota.
 *
 * Ele vive aqui, no lado da porta, porque quem precisa **reagir** ao limite é
 * `domain/` — a geração em lote para no primeiro 429 — e `domain/` não pode
 * importar a classe de erro, que é de `infra/`. A constante é o contrato entre
 * os dois, e o adapter a consome ao nomear o erro, para os dois lados não
 * divergirem em silêncio.
 */
export const LLM_RATE_LIMIT_ERROR_NAME = "LlmRateLimitError";

/** Este erro é o provedor recusando por cota, e não uma falha do dia em si. */
export function isLlmRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.name === LLM_RATE_LIMIT_ERROR_NAME;
}

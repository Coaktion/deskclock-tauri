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

export interface ILlmApi {
  /** Uma completação de chat; devolve o texto da resposta e a cota medida nela. */
  complete(messages: LlmMessage[]): Promise<LlmCompletion>;
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

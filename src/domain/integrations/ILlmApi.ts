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

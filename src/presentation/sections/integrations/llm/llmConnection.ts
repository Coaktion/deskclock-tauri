import {
  LlmAuthError,
  LlmModelUnavailableError,
  LlmNetworkError,
  LlmRateLimitError,
} from "@infra/integrations/llm/errors";

/**
 * Conectado = há um destino e um modelo escolhido.
 *
 * **A chave não entra na conta**, e é deliberado: Ollama e LM Studio rodam sem
 * nenhuma, e amarrar o estado a ela deixaria os dois provedores locais eternamente
 * "não configurados" depois de uma conexão que funcionou.
 */
export function isLlmConnected(baseUrl: string, model: string): boolean {
  return baseUrl.trim() !== "" && model.trim() !== "";
}

/**
 * Erro do provedor traduzido para a frase que a tela mostra.
 *
 * **O erro cru nunca chega ao usuário**: os provedores devolvem JSON de formatos
 * diferentes para a mesma falha, e o texto que sai deles ora é inglês técnico,
 * ora o nome de um campo interno. Só o `LlmAuthError` manda revisar a chave — é
 * o único caso em que ela é a causa.
 */
export function describeLlmError(error: unknown): string {
  if (error instanceof LlmAuthError) {
    return "Chave inválida. Revise a chave e tente novamente.";
  }
  if (error instanceof LlmRateLimitError) {
    return error.retryAfterSeconds === undefined
      ? "Limite de requisições atingido. Tente novamente em alguns minutos."
      : `Limite de requisições atingido. Tente novamente em ${error.retryAfterSeconds}s.`;
  }
  if (error instanceof LlmModelUnavailableError) {
    return "Modelo indisponível para esta chave. Escolha outro.";
  }
  if (error instanceof LlmNetworkError) {
    return "Falha de conexão com o provedor. Verifique a URL e a sua internet.";
  }
  return "Não foi possível validar a conexão.";
}

/**
 * Modelo pré-selecionado depois de um teste bem-sucedido.
 *
 * A lista do provedor vem crua e longa, e mistura transcrição, TTS e embeddings
 * com os de chat — o sugerido do preset é o único palpite que vale, e só quando
 * ele está de fato na lista. O escolhido pelo usuário sempre ganha: ele pode ter
 * digitado um id que a lista não traz, e reescrevê-lo apagaria a escolha.
 */
export function pickDefaultModel(models: string[], current: string, suggested: string): string {
  if (current.trim() !== "") return current;
  if (suggested !== "" && models.includes(suggested)) return suggested;
  return models[0] ?? "";
}

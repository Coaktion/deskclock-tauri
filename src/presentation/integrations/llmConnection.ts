// Fora da seção do card: a ponte da API local e o resumo do dia também
// perguntam se o provedor está conectado (`docs-internal/specs/mcp.md` §7, D3b).

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

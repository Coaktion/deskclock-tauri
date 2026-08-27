/**
 * Catálogo dos provedores compatíveis com a API da OpenAI.
 *
 * É **dado**, não código por provedor: todos falam `POST {baseUrl}/chat/completions`
 * com `Authorization: Bearer`, então um provedor novo é uma linha nesta tabela e
 * nenhuma classe nova. Quem não estiver aqui ainda funciona pelo preset
 * `custom` — a lista sugere, não restringe (ver `llmBaseUrl` em `AppConfig`).
 */
export interface LlmProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  suggestedModel: string;
  requiresApiKey: boolean;
  /**
   * Parâmetros mesclados por cima do subconjunto seguro do request. Ficam por
   * provedor porque são compensação de comportamento dele, não preferência do
   * usuário — ver `OpenAiCompatClient`.
   */
  extras?: Record<string, unknown>;
}

export const DEFAULT_LLM_PROVIDER_ID = "groq";

export const LLM_PROVIDERS: readonly LlmProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    suggestedModel: "openai/gpt-oss-20b",
    requiresApiKey: true,
    // `gpt-oss` é modelo de *reasoning*: sem desligar o raciocínio, ele consome
    // o orçamento de saída antes de escrever a resposta e ainda vaza o
    // rascunho para dentro do texto.
    extras: {
      temperature: 0.2,
      max_completion_tokens: 220,
      reasoning_effort: "low",
      include_reasoning: false,
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    suggestedModel: "gpt-5-nano",
    requiresApiKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    suggestedModel: "openai/gpt-oss-20b",
    requiresApiKey: true,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    suggestedModel: "gemini-3.7-flash",
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1/",
    suggestedModel: "claude-haiku-4-5",
    requiresApiKey: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    suggestedModel: "deepseek-v4-flash",
    requiresApiKey: true,
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    suggestedModel: "ministral-3b-latest",
    requiresApiKey: true,
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    suggestedModel: "grok-4.6",
    requiresApiKey: true,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    suggestedModel: "",
    requiresApiKey: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    suggestedModel: "",
    requiresApiKey: false,
  },
  {
    id: "custom",
    label: "Personalizado",
    baseUrl: "",
    suggestedModel: "",
    requiresApiKey: false,
  },
];

export function findLlmProvider(id: string): LlmProviderPreset | undefined {
  return LLM_PROVIDERS.find((provider) => provider.id === id);
}

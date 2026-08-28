import { invoke } from "@tauri-apps/api/core";
import type {
  ILlmApi,
  LlmCompleteOptions,
  LlmCompletion,
  LlmMessage,
} from "@domain/integrations/ILlmApi";
import type { LlmRateLimits } from "@shared/types/llm";
import {
  LlmAuthError,
  LlmEmptyResponseError,
  LlmModelUnavailableError,
  LlmNetworkError,
  LlmRateLimitError,
} from "./errors";

interface RustHttpResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface OpenAiCompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  extras?: Record<string, unknown>;
  /** O nome com que este provedor aceita o teto de saída — ver `providers.ts`. */
  outputTokensParam?: string;
}

/**
 * Cliente único para todo provedor que fala a API de chat da OpenAI.
 *
 * As chamadas passam pelo Rust (`post_bearer_json` / `get_bearer_json`) e não
 * pelo `fetch` do webview: a Anthropic bloqueia CORS a partir do browser, e
 * assim a chave de API não circula no processo do webview.
 */
export class OpenAiCompatClient implements ILlmApi {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly extras: Record<string, unknown>;
  private readonly outputTokensParam?: string;

  constructor(config: OpenAiCompatConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.extras = config.extras ?? {};
    this.outputTokensParam = config.outputTokensParam;
  }

  async complete(messages: LlmMessage[], options?: LlmCompleteOptions): Promise<LlmCompletion> {
    // Subconjunto seguro: `model`, `messages` e `stream` são o que **todos**
    // aceitam. `max_tokens` devolve 400 na família gpt-5 da OpenAI, que só
    // conhece `max_completion_tokens`, e `temperature` diferente de 1 devolve
    // 400 na mesma família — o tamanho da resposta se controla pelo prompt.
    // O que fugir disso entra pelos `extras` do provedor que precisa.
    const body = {
      model: this.model,
      messages,
      stream: false,
      ...this.extras,
      // Depois dos `extras`, e de propósito: o teto que a chamada pediu é mais
      // específico que qualquer valor que o preset tenha deixado com o mesmo
      // nome.
      ...this.outputTokensField(options?.maxOutputTokens),
    };

    const res = await this.post(`${this.baseUrl}/chat/completions`, body);
    const choice = firstChoice(res.body);
    const content = typeof choice?.message?.content === "string" ? choice.message.content : "";

    if (choice?.finish_reason === "length") {
      throw new LlmEmptyResponseError("A resposta foi cortada antes do fim. Tente novamente.");
    }
    if (!content.trim()) throw new LlmEmptyResponseError();

    const limits = parseRateLimits(res.headers);
    return limits ? { text: content, limits } : { text: content };
  }

  /**
   * A requisição mais barata que existe — não consome tokens —, o que a torna o
   * "testar conexão" da tela além de fonte do seletor de modelos.
   *
   * **Não captura cota.** O `GET /models` não é específico de modelo, e os
   * cabeçalhos `x-ratelimit-*` que ele devolve podem descrever outro balde —
   * mostrá-los como a cota do modelo escolhido seria mentira barata.
   */
  async listModels(): Promise<string[]> {
    const res = await this.request("get_bearer_json", { url: `${this.baseUrl}/models` });
    const data = asRecord(res.body)?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => asRecord(item)?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  /**
   * O teto de saída no nome que **este** provedor aceita — e nada, quando ele
   * não declarou nome nenhum ou a chamada não pediu teto.
   *
   * É o que mantém verdadeiro o subconjunto seguro: dos onze presets só o Groq
   * declara um nome, e os outros dez seguem recebendo exatamente o corpo de
   * antes.
   */
  private outputTokensField(maxOutputTokens?: number): Record<string, number> {
    if (!this.outputTokensParam || maxOutputTokens === undefined) return {};
    return { [this.outputTokensParam]: maxOutputTokens };
  }

  private post(url: string, body: unknown): Promise<RustHttpResponse> {
    return this.request("post_bearer_json", { url, body });
  }

  private async request(
    command: "get_bearer_json" | "post_bearer_json",
    args: Record<string, unknown>
  ): Promise<RustHttpResponse> {
    let res: RustHttpResponse;
    try {
      res = await invoke<RustHttpResponse>(command, { ...args, token: this.apiKey });
    } catch (err) {
      throw new LlmNetworkError(undefined, err);
    }

    if (res.status >= 400) throw toLlmError(res);
    return res;
  }
}

/**
 * Algumas bases vêm com barra final (`.../v1beta/openai/`) e a do DeepSeek não
 * tem `/v1` — juntar à mão produzia `//chat/completions`, que nem todo provedor
 * tolera.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

interface ChatChoice {
  message?: { content?: unknown };
  finish_reason?: unknown;
}

function firstChoice(body: unknown): ChatChoice | undefined {
  const choices = asRecord(body)?.choices;
  return Array.isArray(choices) ? (choices[0] as ChatChoice | undefined) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * O corpo de erro tem quatro formatos diferentes entre os provedores suportados,
 * e `body.error.message` cru quebra em três deles:
 *
 *     Groq/OpenAI/DeepSeek/Gemini  {"error":{"message":"..."}}
 *     Anthropic                    {"type":"error","error":{"type":"…","message":"…"}}
 *     Mistral                      {"detail":"Invalid API Key"}   — sem `error`
 *     xAI                          {"code":"…","error":"…"}       — `error` é string
 */
export function extractErrorMessage(body: unknown, status: number): string {
  const record = asRecord(body);
  const error = record?.error;

  return (
    nonEmptyString(error) ??
    nonEmptyString(asRecord(error)?.message) ??
    nonEmptyString(record?.detail) ??
    nonEmptyString(record?.message) ??
    `HTTP ${status}`
  );
}

/** Chave inválida nem sempre é 401: Gemini e xAI respondem 400 dizendo isso no texto. */
function isCredentialFailure(status: number, message: string): boolean {
  if (status === 401) return true;
  const lower = message.toLowerCase();
  return status === 400 && (lower.includes("api key") || lower.includes("valid key"));
}

function headerNumber(
  headers: Record<string, string> | undefined,
  name: string
): number | undefined {
  const raw = headers?.[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  // Ausente, vazio ou não numérico é **campo ausente**, nunca `NaN` nem `0`:
  // um zero inventado escreveria "restam 0" na tela de quem tem cota de sobra.
  return Number.isFinite(value) ? value : undefined;
}

function headerText(headers: Record<string, string> | undefined, name: string): string | undefined {
  const raw = headers?.[name]?.trim();
  return raw ? raw : undefined;
}

/**
 * A cota que o provedor informou nos cabeçalhos desta resposta.
 *
 * Os nomes chegam em minúsculas do `collect_headers` do Rust, então não há
 * normalização a fazer aqui. Devolve `undefined` quando nenhum dos seis campos
 * veio — **ausente é ausente**, e a tela não desenha área nenhuma.
 */
export function parseRateLimits(
  headers: Record<string, string> | undefined
): LlmRateLimits | undefined {
  const limits: LlmRateLimits = {};

  const requestsLimit = headerNumber(headers, "x-ratelimit-limit-requests");
  const requestsRemaining = headerNumber(headers, "x-ratelimit-remaining-requests");
  const requestsReset = headerText(headers, "x-ratelimit-reset-requests");
  const tokensLimit = headerNumber(headers, "x-ratelimit-limit-tokens");
  const tokensRemaining = headerNumber(headers, "x-ratelimit-remaining-tokens");
  const tokensReset = headerText(headers, "x-ratelimit-reset-tokens");

  if (requestsLimit !== undefined) limits.requestsLimit = requestsLimit;
  if (requestsRemaining !== undefined) limits.requestsRemaining = requestsRemaining;
  if (requestsReset !== undefined) limits.requestsReset = requestsReset;
  if (tokensLimit !== undefined) limits.tokensLimit = tokensLimit;
  if (tokensRemaining !== undefined) limits.tokensRemaining = tokensRemaining;
  if (tokensReset !== undefined) limits.tokensReset = tokensReset;

  return Object.keys(limits).length > 0 ? limits : undefined;
}

function parseRetryAfter(headers: Record<string, string> | undefined): number | undefined {
  const raw = headers?.["retry-after"];
  const seconds = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function toLlmError(res: RustHttpResponse): Error {
  const message = extractErrorMessage(res.body, res.status);

  if (isCredentialFailure(res.status, message)) return new LlmAuthError(message);
  if (res.status === 429) return new LlmRateLimitError(parseRetryAfter(res.headers));
  if (res.status === 403 || res.status === 404) return new LlmModelUnavailableError(message);
  if (res.status >= 500) {
    return new LlmNetworkError(`O provedor está indisponível no momento (${res.status}).`);
  }
  return new LlmNetworkError(message);
}

import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmMessage } from "@domain/integrations/ILlmApi";
import { OpenAiCompatClient } from "@infra/integrations/llm/OpenAiCompatClient";
import {
  LlmAuthError,
  LlmEmptyResponseError,
  LlmModelUnavailableError,
  LlmNetworkError,
  LlmRateLimitError,
} from "@infra/integrations/llm/errors";

const mockInvoke = vi.mocked(invoke);

const BASE_URL = "https://api.groq.com/openai/v1";
const API_KEY = "test-key";
const MODEL = "openai/gpt-oss-20b";
const MESSAGES: LlmMessage[] = [
  { role: "system", content: "Resuma." },
  { role: "user", content: "Três tarefas hoje." },
];

interface RustResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function makeClient(overrides: Partial<ConstructorParameters<typeof OpenAiCompatClient>[0]> = {}) {
  return new OpenAiCompatClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    model: MODEL,
    ...overrides,
  });
}

function reply(text: string, finishReason = "stop"): RustResponse {
  return {
    status: 200,
    body: {
      choices: [{ message: { role: "assistant", content: text }, finish_reason: finishReason }],
    },
    headers: {},
  };
}

function failure(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): RustResponse {
  return { status, body, headers };
}

/** Argumentos com que o adapter chamou o comando Rust na última invocação. */
function lastCall(): { command: string; args: Record<string, unknown> } {
  const [command, args] = mockInvoke.mock.calls.at(-1) as [string, Record<string, unknown>];
  return { command, args };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("OpenAiCompatClient", () => {
  describe("complete", () => {
    it("devolve o texto de choices[0].message.content", async () => {
      mockInvoke.mockResolvedValue(reply("Você trabalhou em três tarefas."));

      const result = await makeClient().complete(MESSAGES);

      expect(result.text).toBe("Você trabalhou em três tarefas.");
    });

    it("monta o request no subconjunto seguro, sem max_tokens nem temperature", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient().complete(MESSAGES);

      const { command, args } = lastCall();
      expect(command).toBe("post_bearer_json");
      expect(args.url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(args.token).toBe(API_KEY);
      expect(args.body).toEqual({ model: MODEL, messages: MESSAGES, stream: false });
    });

    it("mescla os extras do provedor por cima do subconjunto seguro", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({
        extras: { temperature: 0.2, max_completion_tokens: 220, reasoning_effort: "low" },
      }).complete(MESSAGES);

      expect(lastCall().args.body).toEqual({
        model: MODEL,
        messages: MESSAGES,
        stream: false,
        temperature: 0.2,
        max_completion_tokens: 220,
        reasoning_effort: "low",
      });
    });

    it("não escreve teto de saída quando o preset não declara nome para ele", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      // Dez dos onze presets estão nesta situação, e é o corpo que eles sempre
      // tiveram: pedir teto sem nome declarado não pode inventar um.
      await makeClient().complete(MESSAGES, { maxOutputTokens: 1200 });

      expect(lastCall().args.body).toEqual({ model: MODEL, messages: MESSAGES, stream: false });
    });

    it("escreve o teto no nome que o preset declara", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({ outputTokensParam: "max_completion_tokens" }).complete(MESSAGES, {
        maxOutputTokens: 1200,
      });

      expect(lastCall().args.body).toEqual({
        model: MODEL,
        messages: MESSAGES,
        stream: false,
        max_completion_tokens: 1200,
      });
    });

    it("não escreve teto quando a chamada não pede, mesmo com nome declarado", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({ outputTokensParam: "max_completion_tokens" }).complete(MESSAGES);

      expect(lastCall().args.body).toEqual({ model: MODEL, messages: MESSAGES, stream: false });
    });

    it("o teto da chamada ganha do valor que o preset deixou nos extras", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({
        extras: { max_completion_tokens: 220 },
        outputTokensParam: "max_completion_tokens",
      }).complete(MESSAGES, { maxOutputTokens: 1200 });

      expect(lastCall().args.body).toMatchObject({ max_completion_tokens: 1200 });
    });

    it("lança LlmEmptyResponseError quando o conteúdo vem vazio", async () => {
      mockInvoke.mockResolvedValue(reply("   "));

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmEmptyResponseError);
    });

    it("lança LlmEmptyResponseError quando finish_reason é length", async () => {
      mockInvoke.mockResolvedValue(reply("Resumo cortado no me", "length"));

      await expect(makeClient().complete(MESSAGES)).rejects.toThrow(/cortada/i);
    });

    it("lança LlmNetworkError quando o comando Rust falha", async () => {
      mockInvoke.mockRejectedValue("connection refused");

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmNetworkError);
    });
  });

  describe("normalização da base URL", () => {
    it("remove a barra final da base do Gemini", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }).complete(MESSAGES);

      expect(lastCall().args.url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      );
    });

    it("preserva a base sem barra final", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({ baseUrl: "https://api.x.ai/v1" }).complete(MESSAGES);

      expect(lastCall().args.url).toBe("https://api.x.ai/v1/chat/completions");
    });

    it("aceita a base do DeepSeek, que não tem /v1", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      await makeClient({ baseUrl: "https://api.deepseek.com" }).complete(MESSAGES);

      expect(lastCall().args.url).toBe("https://api.deepseek.com/chat/completions");
    });
  });

  describe("extração da mensagem de erro", () => {
    it("lê o formato da Groq, OpenAI, DeepSeek e Gemini: error.message", async () => {
      mockInvoke.mockResolvedValue(failure(404, { error: { message: "model not found" } }));

      await expect(makeClient().complete(MESSAGES)).rejects.toThrow("model not found");
    });

    it("lê o formato da Anthropic, com type ao lado de error.message", async () => {
      mockInvoke.mockResolvedValue(
        failure(404, { type: "error", error: { type: "not_found_error", message: "model: xyz" } })
      );

      await expect(makeClient().complete(MESSAGES)).rejects.toThrow("model: xyz");
    });

    it("lê o formato da Mistral, que usa detail e não tem error", async () => {
      mockInvoke.mockResolvedValue(failure(401, { detail: "Invalid API Key" }));

      await expect(makeClient().complete(MESSAGES)).rejects.toThrow("Invalid API Key");
    });

    it("lê o formato da xAI, em que error é string", async () => {
      mockInvoke.mockResolvedValue(
        failure(403, { code: "Forbidden", error: "The model is not available" })
      );

      await expect(makeClient().complete(MESSAGES)).rejects.toThrow("The model is not available");
    });

    it("cai em HTTP <status> quando o corpo não traz mensagem alguma", async () => {
      mockInvoke.mockResolvedValue(failure(418, null));

      await expect(makeClient().complete(MESSAGES)).rejects.toThrow("HTTP 418");
    });
  });

  describe("classificação do erro", () => {
    it("trata 401 como credencial inválida", async () => {
      mockInvoke.mockResolvedValue(failure(401, { error: { message: "Invalid Authentication" } }));

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmAuthError);
    });

    it("trata o 400 do Gemini como credencial inválida pela mensagem", async () => {
      mockInvoke.mockResolvedValue(
        failure(400, { error: { message: "API key not valid. Please pass a valid API key." } })
      );

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmAuthError);
    });

    it("trata o 400 da xAI como credencial inválida pela mensagem", async () => {
      mockInvoke.mockResolvedValue(
        failure(400, { code: "Bad Request", error: "Incorrect API key provided" })
      );

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmAuthError);
    });

    it("mantém 400 comum fora da credencial", async () => {
      mockInvoke.mockResolvedValue(failure(400, { error: { message: "unsupported parameter" } }));

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmNetworkError);
    });

    it("lê o retry-after do 429 em vez de inventar espera", async () => {
      mockInvoke.mockResolvedValue(
        failure(429, { error: { message: "rate limit" } }, { "retry-after": "37" })
      );

      const error = await makeClient()
        .complete(MESSAGES)
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(LlmRateLimitError);
      expect((error as LlmRateLimitError).retryAfterSeconds).toBe(37);
    });

    it("deixa a espera indefinida no 429 sem retry-after", async () => {
      mockInvoke.mockResolvedValue(failure(429, { error: { message: "rate limit" } }));

      const error = await makeClient()
        .complete(MESSAGES)
        .catch((err: unknown) => err);

      expect((error as LlmRateLimitError).retryAfterSeconds).toBeUndefined();
    });

    it("trata 404 como modelo indisponível", async () => {
      mockInvoke.mockResolvedValue(failure(404, { error: { message: "no such model" } }));

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(
        LlmModelUnavailableError
      );
    });

    it("trata 5xx como falha transitória do provedor", async () => {
      mockInvoke.mockResolvedValue(failure(503, { error: { message: "overloaded" } }));

      await expect(makeClient().complete(MESSAGES)).rejects.toBeInstanceOf(LlmNetworkError);
    });
  });

  describe("cota do provedor", () => {
    const FULL_QUOTA = {
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "312",
      "x-ratelimit-reset-requests": "2m59.56s",
      "x-ratelimit-limit-tokens": "8000",
      "x-ratelimit-remaining-tokens": "7452",
      "x-ratelimit-reset-tokens": "7.66s",
    };

    function replyWith(headers: Record<string, string>): RustResponse {
      return { ...reply("ok"), headers };
    }

    it("lê os seis cabeçalhos, guardando o reset como o provedor o escreveu", async () => {
      mockInvoke.mockResolvedValue(replyWith(FULL_QUOTA));

      const { limits } = await makeClient().complete(MESSAGES);

      expect(limits).toEqual({
        requestsLimit: 1000,
        requestsRemaining: 312,
        requestsReset: "2m59.56s",
        tokensLimit: 8000,
        tokensRemaining: 7452,
        tokensReset: "7.66s",
      });
    });

    it("aceita o provedor que manda só parte dos cabeçalhos", async () => {
      mockInvoke.mockResolvedValue(
        replyWith({
          "x-ratelimit-limit-requests": "60",
          "x-ratelimit-remaining-requests": "59",
        })
      );

      const { limits } = await makeClient().complete(MESSAGES);

      expect(limits).toEqual({ requestsLimit: 60, requestsRemaining: 59 });
    });

    it("deixa a cota ausente quando o provedor não manda cabeçalho nenhum", async () => {
      mockInvoke.mockResolvedValue(reply("ok"));

      const { limits } = await makeClient().complete(MESSAGES);

      expect(limits).toBeUndefined();
    });

    it("descarta o campo não numérico em vez de gravar NaN ou zero", async () => {
      mockInvoke.mockResolvedValue(
        replyWith({
          "x-ratelimit-limit-requests": "ilimitado",
          "x-ratelimit-remaining-requests": "",
          "x-ratelimit-limit-tokens": "8000",
          "x-ratelimit-remaining-tokens": "7452",
        })
      );

      const { limits } = await makeClient().complete(MESSAGES);

      expect(limits).toEqual({ tokensLimit: 8000, tokensRemaining: 7452 });
    });

    it("não captura cota no GET /models — os cabeçalhos dele podem ser de outro balde", async () => {
      mockInvoke.mockResolvedValue({
        status: 200,
        body: { data: [{ id: "gpt-5-nano" }] },
        headers: FULL_QUOTA,
      });

      await expect(makeClient().listModels()).resolves.toEqual(["gpt-5-nano"]);
    });
  });

  describe("listModels", () => {
    it("devolve os ids de data[] pelo GET /models", async () => {
      mockInvoke.mockResolvedValue({
        status: 200,
        body: { object: "list", data: [{ id: "gpt-5-nano" }, { id: "openai/gpt-oss-20b" }] },
        headers: {},
      });

      const models = await makeClient().listModels();

      expect(models).toEqual(["gpt-5-nano", "openai/gpt-oss-20b"]);
      const { command, args } = lastCall();
      expect(command).toBe("get_bearer_json");
      expect(args.url).toBe("https://api.groq.com/openai/v1/models");
      expect(args.token).toBe(API_KEY);
    });

    it("devolve lista vazia quando o corpo não traz data", async () => {
      mockInvoke.mockResolvedValue({ status: 200, body: {}, headers: {} });

      await expect(makeClient().listModels()).resolves.toEqual([]);
    });

    it("propaga credencial inválida — é o teste de conexão da tela", async () => {
      mockInvoke.mockResolvedValue(failure(401, { error: { message: "Invalid API Key" } }));

      await expect(makeClient().listModels()).rejects.toBeInstanceOf(LlmAuthError);
    });
  });
});

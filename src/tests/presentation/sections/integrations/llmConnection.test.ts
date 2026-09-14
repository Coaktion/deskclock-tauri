import { describe, it, expect } from "vitest";
import {
  describeLlmError,
  isLlmConnected,
  pickDefaultModel,
} from "@presentation/sections/integrations/llm/llmConnection";
import {
  LlmAuthError,
  LlmEmptyResponseError,
  LlmModelUnavailableError,
  LlmNetworkError,
  LlmRateLimitError,
} from "@infra/integrations/llm/errors";

describe("isLlmConnected", () => {
  it("exige destino e modelo", () => {
    expect(isLlmConnected("https://api.groq.com/openai/v1", "openai/gpt-oss-20b")).toBe(true);
    expect(isLlmConnected("", "openai/gpt-oss-20b")).toBe(false);
    expect(isLlmConnected("https://api.groq.com/openai/v1", "")).toBe(false);
  });

  it("ignora espaço em branco", () => {
    expect(isLlmConnected("   ", "  ")).toBe(false);
  });

  it("dá por conectado o provedor local, que não tem chave", () => {
    expect(isLlmConnected("http://localhost:11434/v1", "llama3")).toBe(true);
  });
});

describe("describeLlmError", () => {
  it("é o único a mandar revisar a chave quando a falha é de autenticação", () => {
    expect(describeLlmError(new LlmAuthError())).toContain("Chave inválida");
  });

  it("informa a espera do provedor quando ele a declarou", () => {
    expect(describeLlmError(new LlmRateLimitError(42))).toContain("42s");
    expect(describeLlmError(new LlmRateLimitError())).toContain("alguns minutos");
  });

  it("distingue modelo indisponível de falha de conexão", () => {
    expect(describeLlmError(new LlmModelUnavailableError())).toContain("Modelo indisponível");
    expect(describeLlmError(new LlmNetworkError())).toContain("Falha de conexão");
  });

  it("não vaza o texto cru de um erro que não conhece", () => {
    const generico = "Não foi possível validar a conexão.";
    expect(describeLlmError(new LlmEmptyResponseError("choices[0] veio nulo"))).toBe(generico);
    expect(describeLlmError(new Error("ECONNREFUSED 127.0.0.1:11434"))).toBe(generico);
    expect(describeLlmError("string solta")).toBe(generico);
  });
});

describe("pickDefaultModel", () => {
  const lista = ["whisper-large-v3", "openai/gpt-oss-20b", "llama-3.3-70b"];

  it("preserva a escolha do usuário mesmo fora da lista", () => {
    expect(pickDefaultModel(lista, "meu-modelo-interno", "openai/gpt-oss-20b")).toBe(
      "meu-modelo-interno"
    );
  });

  it("usa o sugerido do preset quando ele está na lista", () => {
    expect(pickDefaultModel(lista, "", "openai/gpt-oss-20b")).toBe("openai/gpt-oss-20b");
  });

  it("cai no primeiro da lista quando o sugerido não está nela", () => {
    expect(pickDefaultModel(lista, "", "gpt-5-nano")).toBe("whisper-large-v3");
    expect(pickDefaultModel(lista, "", "")).toBe("whisper-large-v3");
  });

  it("devolve vazio quando o provedor não anunciou modelo nenhum", () => {
    expect(pickDefaultModel([], "", "gpt-5-nano")).toBe("");
  });
});

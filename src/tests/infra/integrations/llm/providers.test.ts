import { describe, expect, it } from "vitest";

import { LLM_PROVIDERS } from "@infra/integrations/llm/providers";

/**
 * O catálogo é dado, não código — mas duas coisas nele quebram calado, e são
 * estas as travas.
 */
describe("LLM_PROVIDERS", () => {
  it("nenhum preset carrega teto de saída nos extras", () => {
    // O teto é da chamada (`LlmCompleteOptions`). De volta nos `extras`, ele
    // valeria para toda chamada do app e truncaria a que precisasse de mais
    // espaço — e truncado o provedor devolve `finish_reason: "length"`, que a
    // tela mostra como resposta vazia: "tente novamente" para o que nunca passa.
    const withCeiling = LLM_PROVIDERS.filter((preset) =>
      Object.keys(preset.extras ?? {}).some((key) => /tokens/i.test(key))
    );
    expect(withCeiling.map((preset) => preset.id)).toEqual([]);
  });

  it("nenhum preset declara max_tokens como nome do teto", () => {
    // A família gpt-5 da OpenAI devolve 400 para `max_tokens` e só conhece
    // `max_completion_tokens`.
    const wrongName = LLM_PROVIDERS.filter((preset) => preset.outputTokensParam === "max_tokens");
    expect(wrongName.map((preset) => preset.id)).toEqual([]);
  });

  it("o Groq aceita teto de saída, e pelo nome da família gpt-5", () => {
    const groq = LLM_PROVIDERS.find((preset) => preset.id === "groq");
    expect(groq?.outputTokensParam).toBe("max_completion_tokens");
  });
});

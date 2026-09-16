import { describe, it, expect } from "vitest";
import { MAX_SUMMARY_DAYS } from "@domain/usecases/llm/SummarizeWorkdays";
import { summaryProgressLabel, summaryScopeNote } from "@presentation/hooks/daySummaries";

describe("summaryScopeNote", () => {
  it("cala quando a busca cabe no teto", () => {
    expect(summaryScopeNote(1)).toBeNull();
    expect(summaryScopeNote(MAX_SUMMARY_DAYS)).toBeNull();
  });

  it("avisa o corte quando a busca passa do teto", () => {
    expect(summaryScopeNote(MAX_SUMMARY_DAYS + 1)).toBe(
      `A busca trouxe ${MAX_SUMMARY_DAYS + 1} dias; o resumo cobre os ${MAX_SUMMARY_DAYS} mais recentes.`
    );
  });

  it("não avisa nada numa busca sem dia", () => {
    expect(summaryScopeNote(0)).toBeNull();
  });
});

describe("summaryProgressLabel", () => {
  it("conta a partir de 1, e não de 0 — quem lê conta dias, não índices", () => {
    expect(summaryProgressLabel(0, 5)).toBe("Gerando 1 de 5…");
    expect(summaryProgressLabel(1, 5)).toBe("Gerando 2 de 5…");
  });

  it("não passa do total no último dia", () => {
    expect(summaryProgressLabel(4, 5)).toBe("Gerando 5 de 5…");
  });
});

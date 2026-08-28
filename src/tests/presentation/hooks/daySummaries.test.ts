import { describe, it, expect } from "vitest";
import { MAX_SUMMARY_DAYS } from "@domain/usecases/llm/SummarizeWorkdays";
import { summaryButtonLabel, summaryProgressLabel } from "@presentation/hooks/daySummaries";

describe("summaryButtonLabel", () => {
  it("diz o número de dias no singular", () => {
    expect(summaryButtonLabel(1)).toBe("Gerar resumo de 1 dia");
  });

  it("diz o número de dias no plural", () => {
    expect(summaryButtonLabel(3)).toBe("Gerar resumo de 3 dias");
  });

  it("no teto, ainda diz o número exato", () => {
    expect(summaryButtonLabel(MAX_SUMMARY_DAYS)).toBe(`Gerar resumo de ${MAX_SUMMARY_DAYS} dias`);
  });

  it("acima do teto, avisa que só os mais recentes entram", () => {
    expect(summaryButtonLabel(MAX_SUMMARY_DAYS + 1)).toBe(
      `Gerar resumo dos ${MAX_SUMMARY_DAYS} dias mais recentes`
    );
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

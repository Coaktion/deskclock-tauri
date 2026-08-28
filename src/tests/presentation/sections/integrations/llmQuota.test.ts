import { describe, expect, it } from "vitest";

import { buildLlmQuotaView } from "@presentation/sections/integrations/llm/llmQuota";
import type { LlmRateLimits } from "@shared/types/llm";

import { localISO } from "../../../helpers/localTime";

const NOW = new Date(localISO(2026, 8, 27, 15, 0));

const FULL: LlmRateLimits = {
  requestsLimit: 1000,
  requestsRemaining: 312,
  requestsReset: "2m59.56s",
  tokensLimit: 8000,
  tokensRemaining: 7452,
  tokensReset: "7.66s",
};

/** Minutos antes de `NOW`, como instante ISO. */
function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("buildLlmQuotaView", () => {
  it("monta as duas linhas com os números e o texto de renovação do provedor", () => {
    const view = buildLlmQuotaView(FULL, minutesAgo(5), NOW);

    expect(view?.lines).toEqual([
      { id: "requests", noun: "requisições", amount: "312 de 1000", renewsIn: "2m59s" },
      { id: "tokens", noun: "tokens", amount: "7452 de 8000", renewsIn: "7s" },
    ]);
  });

  it("não escreve o período de nenhum balde — ele muda por provedor", () => {
    const view = buildLlmQuotaView(FULL, minutesAgo(5), NOW);

    const texto = view!.lines
      .map((line) => `${line.amount} ${line.noun} ${line.renewsIn}`)
      .join(" ");
    expect(texto).not.toMatch(/hoje|dia|minuto|hora/);
  });

  it("omite a linha cujo restante ou limite não veio", () => {
    const view = buildLlmQuotaView(
      { requestsRemaining: 312, tokensLimit: 8000, tokensRemaining: 7452 },
      minutesAgo(5),
      NOW
    );

    expect(view?.lines.map((line) => line.id)).toEqual(["tokens"]);
  });

  it("monta a linha sem renovação quando o provedor não manda o reset", () => {
    const view = buildLlmQuotaView(
      { requestsLimit: 60, requestsRemaining: 59 },
      minutesAgo(5),
      NOW
    );

    expect(view?.lines[0]).toEqual({ id: "requests", noun: "requisições", amount: "59 de 60" });
  });

  it("devolve null sem cota nenhuma — a área não aparece", () => {
    expect(buildLlmQuotaView(undefined, minutesAgo(5), NOW)).toBeNull();
    expect(buildLlmQuotaView({}, minutesAgo(5), NOW)).toBeNull();
  });

  it("devolve null quando nunca houve medição", () => {
    expect(buildLlmQuotaView(FULL, "", NOW)).toBeNull();
    expect(buildLlmQuotaView(FULL, "não é uma data", NOW)).toBeNull();
  });

  describe("idade da medição", () => {
    it("chama de recente a medição de minutos atrás", () => {
      const view = buildLlmQuotaView(FULL, minutesAgo(12), NOW);

      expect(view?.stale).toBe(false);
      expect(view?.measuredAgo).toBe("há 12 minutos");
    });

    it("diz agora mesmo abaixo de um minuto", () => {
      expect(buildLlmQuotaView(FULL, minutesAgo(0), NOW)?.measuredAgo).toBe("agora mesmo");
    });

    it("usa o singular na unidade de valor um", () => {
      expect(buildLlmQuotaView(FULL, minutesAgo(1), NOW)?.measuredAgo).toBe("há 1 minuto");
      expect(buildLlmQuotaView(FULL, minutesAgo(60), NOW)?.measuredAgo).toBe("há 1 hora");
      expect(buildLlmQuotaView(FULL, minutesAgo(60 * 24), NOW)?.measuredAgo).toBe("há 1 dia");
    });

    it("marca como velha a medição de mais de uma hora", () => {
      const view = buildLlmQuotaView(FULL, minutesAgo(90), NOW);

      expect(view?.stale).toBe(true);
      expect(view?.measuredAgo).toBe("há 1 hora");
    });

    it("conta em dias a medição antiga", () => {
      const view = buildLlmQuotaView(FULL, minutesAgo(60 * 24 * 3), NOW);

      expect(view?.stale).toBe(true);
      expect(view?.measuredAgo).toBe("há 3 dias");
    });
  });
});

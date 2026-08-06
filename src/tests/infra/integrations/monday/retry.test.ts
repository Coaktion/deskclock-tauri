import { describe, it, expect } from "vitest";
import {
  MondayAuthError,
  MondayNetworkError,
  MondayNotFoundError,
  MondayRateLimitError,
  MondayServerError,
  MondayValidationError,
} from "@infra/integrations/monday/errors";
import {
  MAX_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  nextRetryDelayMs,
  parseComplexityResetSeconds,
  parseRetryAfterSeconds,
} from "@infra/integrations/monday/retry";

/** Jitter fixo no meio da faixa, para as asserções não dependerem do sorteio. */
const noJitter = () => 0.5;

const QUERY = false;
const MUTATION = true;

describe("parseRetryAfterSeconds", () => {
  it("lê o cabeçalho em segundos", () => {
    expect(parseRetryAfterSeconds("30")).toBe(30);
    expect(parseRetryAfterSeconds(" 5 ")).toBe(5);
    expect(parseRetryAfterSeconds("0")).toBe(0);
  });

  it("ignora ausência e formatos que não são número", () => {
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
    expect(parseRetryAfterSeconds(undefined)).toBeUndefined();
    expect(parseRetryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
  });
});

describe("parseComplexityResetSeconds", () => {
  it("extrai os segundos da mensagem de complexidade do Monday", () => {
    const message =
      "Complexity budget exhausted, query cost 10000, budget remaining 0, reset in 34 seconds";
    expect(parseComplexityResetSeconds(message)).toBe(34);
  });

  it("devolve indefinido quando a mensagem não traz o prazo", () => {
    expect(parseComplexityResetSeconds("Rate limit exceeded")).toBeUndefined();
  });
});

describe("nextRetryDelayMs", () => {
  it("desiste ao esgotar as tentativas", () => {
    expect(nextRetryDelayMs(new MondayRateLimitError(), MAX_ATTEMPTS, QUERY, noJitter)).toBeNull();
  });

  it("cresce o intervalo a cada tentativa", () => {
    const first = nextRetryDelayMs(new MondayServerError(500), 1, QUERY, noJitter)!;
    const second = nextRetryDelayMs(new MondayServerError(500), 2, QUERY, noJitter)!;

    expect(second).toBeGreaterThan(first);
  });

  it("espalha as tentativas com jitter, para os lotes paralelos não voltarem juntos", () => {
    const low = nextRetryDelayMs(new MondayServerError(500), 1, QUERY, () => 0)!;
    const high = nextRetryDelayMs(new MondayServerError(500), 1, QUERY, () => 1)!;

    expect(low).toBeLessThan(high);
  });

  it("honra o prazo declarado pelo Monday", () => {
    const delay = nextRetryDelayMs(new MondayRateLimitError(5), 1, QUERY, noJitter)!;

    // Nunca menos que o prazo: cair antes da janela reabrir gasta a tentativa.
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS);
  });

  it("desiste quando o prazo declarado passa do teto de espera", () => {
    // 60 s de spinner não é nova tentativa, é janela travada — e a mensagem do
    // erro já diz em quanto tempo tentar de novo.
    expect(nextRetryDelayMs(new MondayRateLimitError(60), 1, QUERY, noJitter)).toBeNull();
  });

  describe("mutation", () => {
    it("repete recusa por limite — nada foi gravado", () => {
      expect(nextRetryDelayMs(new MondayRateLimitError(1), 1, MUTATION, noJitter)).not.toBeNull();
    });

    it("não repete 5xx nem falha de rede — a escrita pode ter acontecido", () => {
      expect(nextRetryDelayMs(new MondayServerError(502), 1, MUTATION, noJitter)).toBeNull();
      expect(nextRetryDelayMs(new MondayNetworkError(), 1, MUTATION, noJitter)).toBeNull();
    });
  });

  describe("query", () => {
    it("repete 5xx e falha de rede", () => {
      expect(nextRetryDelayMs(new MondayServerError(502), 1, QUERY, noJitter)).not.toBeNull();
      expect(nextRetryDelayMs(new MondayNetworkError(), 1, QUERY, noJitter)).not.toBeNull();
    });
  });

  it("nunca repete o que daria o mesmo resultado na segunda vez", () => {
    for (const err of [
      new MondayValidationError("Column not found"),
      new MondayAuthError(),
      new MondayNotFoundError(),
      new Error("qualquer outra coisa"),
    ]) {
      expect(nextRetryDelayMs(err, 1, QUERY, noJitter)).toBeNull();
    }
  });
});

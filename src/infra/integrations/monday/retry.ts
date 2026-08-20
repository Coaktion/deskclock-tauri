import { MondayNetworkError, MondayRateLimitError, MondayServerError } from "./errors";

/** Tentativas por requisição, contando a primeira. */
export const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 800;

/**
 * Teto do que vale a pena esperar dentro de uma requisição.
 *
 * Acima disso a nova tentativa deixa de ser "um soluço" e vira janela travada:
 * boa parte destas chamadas está por trás de um spinner de modal. Passando do
 * teto, o erro sobe — e ele já diz em quantos segundos tentar de novo, o que é
 * mais útil que um giro de um minuto que ninguém sabe se vai terminar.
 */
export const MAX_RETRY_DELAY_MS = 15_000;

/** `Retry-After` em segundos. O formato de data do HTTP não é usado pelo Monday. */
export function parseRetryAfterSeconds(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Segundos até o orçamento de complexidade reabrir, quando o Monday os informa
 * na mensagem ("...reset in 34 seconds"). Mensagem de terceiro, então a falta de
 * casamento é normal e cai no backoff comum.
 */
export function parseComplexityResetSeconds(message: string): number | undefined {
  const match = /reset in (\d+)\s*seconds?/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

function backoffMs(attempt: number, random: () => number): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  // ±25% para dessincronizar os lotes que correm em paralelo: sem isso os
  // quatro tomam 429 juntos e voltam juntos, reproduzindo a rajada que causou.
  return Math.round(base * (0.75 + random() * 0.5));
}

/**
 * Quanto esperar antes de repetir a requisição, ou `null` para desistir.
 *
 * **Mutation só repete em recusa por limite**, nunca em 5xx nem em falha de
 * rede. Nos dois últimos a requisição pode ter chegado e sido executada — a
 * resposta é que se perdeu —, e repetir criaria a atividade duas vezes no board
 * do cliente, que é exatamente o defeito que o rastreamento de itens existe para
 * evitar. Já o 429 e o estouro de complexidade são recusas **antes** da
 * execução: nada foi gravado, e repetir é seguro.
 *
 * `MondayValidationError`, `MondayAuthError` e `MondayNotFoundError` ficam de
 * fora de propósito — a resposta seria a mesma na segunda vez.
 */
export function nextRetryDelayMs(
  err: unknown,
  attempt: number,
  isMutation: boolean,
  random: () => number = Math.random
): number | null {
  if (attempt >= MAX_ATTEMPTS) return null;

  if (err instanceof MondayRateLimitError) {
    const { retryAfterSeconds } = err;
    if (retryAfterSeconds === undefined) return backoffMs(attempt, random);
    if (retryAfterSeconds * 1000 > MAX_RETRY_DELAY_MS) return null;
    // Com prazo declarado, o jitter só soma: encurtá-lo cairia antes da janela
    // reabrir e gastaria a tentativa para receber o mesmo 429.
    return Math.round(retryAfterSeconds * 1000 * (1 + random() * 0.25));
  }

  if (err instanceof MondayServerError || err instanceof MondayNetworkError) {
    return isMutation ? null : backoffMs(attempt, random);
  }

  return null;
}

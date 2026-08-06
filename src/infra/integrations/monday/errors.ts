/** Sugestão de ação que acompanha toda recusa de credencial. */
const AUTH_HINT = "Token do Monday inválido ou revogado. Reconecte.";

/**
 * O detalhe vindo do Monday **acompanha** a sugestão, em vez de substituí-la:
 * "reconecte" é o que resolve o token vencido, e a mensagem deles é o que
 * distingue esse caso do "sem acesso a este board" — que reconectar não muda.
 */
export function authMessage(status: number, detail?: string): string {
  return detail ? `${AUTH_HINT} (HTTP ${status}: ${detail})` : AUTH_HINT;
}

export class MondayAuthError extends Error {
  constructor(message = AUTH_HINT) {
    super(message);
    this.name = "MondayAuthError";
  }
}

/**
 * Limite de requisições ou orçamento de complexidade estourado.
 *
 * `retryAfterSeconds` vem do cabeçalho `Retry-After` ou da própria mensagem de
 * complexidade, e é o que decide entre esperar e desistir (§ `retry.ts`): sem
 * ele, a nova tentativa é um palpite que pode cair antes da janela reabrir e
 * gastar orçamento à toa.
 */
export class MondayRateLimitError extends Error {
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number) {
    super(
      retryAfterSeconds
        ? `Limite de requisições do Monday atingido. Tente novamente em ~${retryAfterSeconds} s.`
        : "Limite de requisições do Monday atingido. Tente em alguns minutos."
    );
    this.name = "MondayRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Erro do lado do Monday (HTTP 5xx).
 *
 * Separado do `MondayValidationError` porque os dois pedem coisas opostas: o de
 * validação diz que a query está errada e repeti-la só repete o erro; o 5xx não
 * diz nada sobre a query, e é o caso em que tentar de novo costuma resolver.
 * Enquanto os dois eram a mesma classe, não havia como escrever essa distinção.
 */
export class MondayServerError extends Error {
  readonly status: number;

  constructor(status: number, detail?: string) {
    super(
      detail
        ? `O Monday respondeu com erro interno (HTTP ${status}): ${detail}`
        : `O Monday respondeu com erro interno (HTTP ${status}). Tente novamente em instantes.`
    );
    this.name = "MondayServerError";
    this.status = status;
  }
}

/** O item/board referenciado não existe mais no Monday (foi apagado por lá). */
export class MondayNotFoundError extends Error {
  constructor(message = "Recurso não encontrado no Monday.") {
    super(message);
    this.name = "MondayNotFoundError";
  }
}

export class MondayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MondayValidationError";
  }
}

export class MondayNetworkError extends Error {
  readonly originalCause?: unknown;

  constructor(originalCause?: unknown) {
    super("Erro de conexão com o Monday. Verifique sua internet.");
    this.name = "MondayNetworkError";
    this.originalCause = originalCause;
  }
}

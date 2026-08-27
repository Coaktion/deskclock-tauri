export class LlmAuthError extends Error {
  constructor(message = "Chave de API inválida ou revogada. Revise a configuração.") {
    super(message);
    this.name = "LlmAuthError";
  }
}

export class LlmRateLimitError extends Error {
  /** Segundos informados pelo provedor no `retry-after`; `undefined` quando ele não disse. */
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number) {
    super(
      retryAfterSeconds === undefined
        ? "Limite de requisições atingido. Tente novamente em alguns minutos."
        : `Limite de requisições atingido. Tente novamente em ${retryAfterSeconds}s.`
    );
    this.name = "LlmRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class LlmModelUnavailableError extends Error {
  constructor(message = "Modelo indisponível para esta chave. Escolha outro.") {
    super(message);
    this.name = "LlmModelUnavailableError";
  }
}

/** Resposta vazia ou cortada no meio — o texto existe, mas não serve. */
export class LlmEmptyResponseError extends Error {
  constructor(message = "O provedor devolveu uma resposta vazia. Tente novamente.") {
    super(message);
    this.name = "LlmEmptyResponseError";
  }
}

export class LlmNetworkError extends Error {
  readonly originalCause?: unknown;

  constructor(
    message = "Erro de conexão com o provedor. Verifique sua internet.",
    cause?: unknown
  ) {
    super(message);
    this.name = "LlmNetworkError";
    this.originalCause = cause;
  }
}

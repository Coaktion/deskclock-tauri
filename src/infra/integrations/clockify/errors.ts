export class ClockifyAuthError extends Error {
  constructor(message = "Chave de API inválida ou revogada. Reconecte.") {
    super(message);
    this.name = "ClockifyAuthError";
  }
}

export class ClockifyRateLimitError extends Error {
  constructor() {
    super("Limite de requisições atingido. Tente em alguns minutos.");
    this.name = "ClockifyRateLimitError";
  }
}

export class ClockifyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockifyValidationError";
  }
}

export class ClockifyNetworkError extends Error {
  constructor(cause?: unknown) {
    super("Erro de conexão com o Clockify. Verifique sua internet.");
    this.name = "ClockifyNetworkError";
    if (cause instanceof Error) this.cause = cause;
  }
}

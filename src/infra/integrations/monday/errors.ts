export class MondayAuthError extends Error {
  constructor(message = "Token do Monday inválido ou revogado. Reconecte.") {
    super(message);
    this.name = "MondayAuthError";
  }
}

export class MondayRateLimitError extends Error {
  constructor() {
    super("Limite de requisições do Monday atingido. Tente em alguns minutos.");
    this.name = "MondayRateLimitError";
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

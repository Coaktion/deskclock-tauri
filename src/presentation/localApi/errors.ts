import { DomainError, DuplicateNameError } from "@shared/errors";
import type { LocalApiResult } from "./types";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Referência a algo que não existe no workspace — projeto, categoria, o próprio workspace. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export function errorResult(status: number, message: string): LocalApiResult {
  return { status, body: { error: message } };
}

export function toErrorResult(error: unknown): LocalApiResult {
  if (error instanceof NotFoundError) return errorResult(404, error.message);
  if (error instanceof ConflictError || error instanceof DuplicateNameError) {
    return errorResult(409, error.message);
  }
  if (error instanceof DomainError) return errorResult(400, error.message);
  const message = error instanceof Error ? error.message : String(error);
  return errorResult(500, `Erro interno: ${message}`);
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class DuplicateNameError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateNameError";
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly details?: string[];

  constructor(message = 'Validation failed', details?: string[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

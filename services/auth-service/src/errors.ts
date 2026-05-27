/**
 * Domain-specific error classes for the Auth Service.
 * Each error maps directly to a contract error code defined in contracts/auth.md.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** 401 — email or password incorrect (intentionally generic to prevent enumeration) */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, 'invalid_credentials', 'Email or password is incorrect');
    this.name = 'InvalidCredentialsError';
    Object.setPrototypeOf(this, InvalidCredentialsError.prototype);
  }
}

/** 401 — JWT signature valid but exp claim in the past */
export class TokenExpiredError extends AppError {
  constructor() {
    super(401, 'token_expired', 'Access token has expired');
    this.name = 'TokenExpiredError';
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

/** 401 — JWT signature verification failed or malformed token */
export class InvalidTokenError extends AppError {
  constructor() {
    super(401, 'invalid_token', 'Access token is invalid');
    this.name = 'InvalidTokenError';
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

/** 401 — refresh token not found in Redis (expired, revoked, or replay) */
export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super(401, 'invalid_refresh_token', 'Refresh token is invalid or expired');
    this.name = 'InvalidRefreshTokenError';
    Object.setPrototypeOf(this, InvalidRefreshTokenError.prototype);
  }
}

/** 503 — User Service unreachable or returned an unexpected 5xx */
export class ServiceUnavailableError extends AppError {
  constructor() {
    super(503, 'service_unavailable', 'Authentication service is temporarily unavailable');
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/** 401 — Authorization header missing or does not start with "Bearer " */
export class UnauthorizedError extends AppError {
  constructor() {
    super(401, 'unauthorized', 'No authentication token provided');
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

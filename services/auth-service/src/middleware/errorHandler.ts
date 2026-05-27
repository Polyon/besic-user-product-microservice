import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { env } from '../config/env';
import { logger } from '../config/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors → 400 with structured field details
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
    }));
    res.status(400).json({ error: 'validation_error', details });
    return;
  }

  // Known domain errors — use the pre-assigned status code and error code
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }

  // Unknown / unexpected errors — never expose internal details outside development
  logger.error({ err }, 'Unhandled error');
  const body: Record<string, unknown> = {
    error: 'internal_server_error',
    message: 'An unexpected error occurred',
  };
  /* istanbul ignore next */
  if (env.NODE_ENV === 'development') {
    body['stack'] = err.stack;
  }
  res.status(500).json(body);
}

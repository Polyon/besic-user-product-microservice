import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { NotFoundError, ValidationError } from '../errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    res.status(400).json({ error: 'Validation error', details });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof ValidationError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details !== undefined) body['details'] = err.details;
    res.status(400).json(body);
    return;
  }

  // Never expose stack traces or internal details outside development
  /* istanbul ignore next */
  if (env.NODE_ENV === 'development') {
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}

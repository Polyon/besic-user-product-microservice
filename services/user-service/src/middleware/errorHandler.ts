import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

interface MongoError extends Error {
  code?: number;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const mongoErr = err as MongoError;

  if (mongoErr.code === 11000) {
    res.status(409).json({ error: 'A user with this email already exists' });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((e) => e.message);
    res.status(400).json({ error: 'Validation error', details });
    return;
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details !== undefined) body['details'] = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // Never expose internal error details to the client
  res.status(500).json({ error: 'Internal server error' });
}

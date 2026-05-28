import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { AppError } from './errorHandler';

/**
 * Middleware that validates the X-Internal-Api-Key header using a timing-safe
 * comparison to prevent timing attacks. Returns 401 if missing or invalid.
 */
export function internalApiKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.headers['x-internal-api-key'];

  if (typeof provided !== 'string' || provided.length === 0) {
    return next(new AppError(401, 'Unauthorised'));
  }

  const expected = env.INTERNAL_API_KEY;

  // Use fixed-length buffers to ensure timingSafeEqual is meaningful
  const providedBuf = Buffer.alloc(expected.length);
  const expectedBuf = Buffer.from(expected);

  providedBuf.write(provided.slice(0, expected.length));

  const valid =
    provided.length === expected.length &&
    timingSafeEqual(providedBuf, expectedBuf);

  if (!valid) {
    return next(new AppError(401, 'Unauthorised'));
  }

  next();
}

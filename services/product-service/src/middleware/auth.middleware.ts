import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface JwtPayload {
  userId: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.info(
      { method: req.method, path: req.path, reason: 'missing_token' },
      'Auth failure',
    );
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    res.locals['user'] = payload;

    logger.info(
      {
        method: req.method,
        path: req.path,
        userId: payload.userId,
        timestamp: new Date().toISOString(),
      },
      'Auth success',
    );

    next();
  } catch (err) {
    const reason = err instanceof jwt.TokenExpiredError ? 'token_expired' : 'invalid_token';
    logger.info({ method: req.method, path: req.path, reason }, 'Auth failure');
    res.status(401).json({ error: 'Unauthorised' });
  }
}

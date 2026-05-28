import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import { logger } from '../config/logger';

interface JwtPayload {
  sub: string;
  email: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError(401, 'Unauthorised'));
    return;
  }
  
  const token = authHeader.slice(7);
  
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    res.locals['user'] = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    next(new AppError(401, 'Unauthorised'));
  }
}

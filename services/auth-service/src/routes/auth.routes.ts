import { Router, Request, Response, NextFunction } from 'express';
import { loginRateLimiter } from '../middleware/rateLimiter';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
} from '../validators/auth.validators';
import { verifyCredentials } from '../services/user-client.service';
import { signAccessToken, storeRefreshToken, verifyAccessToken, getRefreshToken, rotateRefreshToken, deleteRefreshToken } from '../services/token.service';
import { UnauthorizedError, InvalidRefreshTokenError } from '../errors';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const authRouter = Router();

/**
 * POST /auth/login
 * Public — rate-limited to RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_MS per IP.
 * Full implementation: Phase 3 (T025).
 */
authRouter.post(
  '/login',
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = LoginRequestSchema.parse(req.body);
      const user = await verifyCredentials(email, password);
      const accessToken = signAccessToken(user.id, user.email);
      const refreshToken = await storeRefreshToken(user.id, user.email);

      logger.info({ userId: user.id, timestamp: new Date().toISOString() }, 'Login success');

      res.status(200).json({
        accessToken,
        refreshToken,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        user: { id: user.id, email: user.email },
      });
    } catch (err) {
      logger.warn({ reason: (err as Error).name }, 'Login failure');
      next(err);
    }
  },
);

/**
 * POST /auth/verify
 * Requires Authorization: Bearer <accessToken> header.
 * Full implementation: Phase 4 (T030).
 */
authRouter.post('/verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError();
    }
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    logger.info({ userId: payload.sub }, 'Token verified');

    res.status(200).json({
      userId: payload.sub,
      email: payload.email,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/refresh
 * Refresh token in request body; returns new token pair.
 * Full implementation: Phase 5 (T035).
 */
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = RefreshRequestSchema.parse(req.body);
    const existing = await getRefreshToken(refreshToken);
    if (!existing) {
      throw new InvalidRefreshTokenError();
    }
    const newRefreshToken = await rotateRefreshToken(refreshToken, existing.userId, existing.email);
    const accessToken = signAccessToken(existing.userId, existing.email);

    logger.info({ userId: existing.userId }, 'Token refreshed');

    res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/logout
 * Refresh token in request body; revokes it. Idempotent.
 * Full implementation: Phase 6 (T039).
 */
authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = LogoutRequestSchema.parse(req.body);
    // Look up before deleting so we can log the userId (idempotent: null is fine)
    const existing = await getRefreshToken(refreshToken);
    await deleteRefreshToken(refreshToken);

    if (existing) {
      logger.info({ userId: existing.userId }, 'Logout — refresh token revoked');
    } else {
      logger.info('Logout — token already revoked or unknown (idempotent)');
    }

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

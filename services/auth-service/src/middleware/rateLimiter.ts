import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { env } from '../config/env';

/**
 * Redis-backed rate limiter for POST /auth/login only.
 * In test environment the default in-memory store is used so tests never
 * require a live Redis connection for rate-limit counters.
 */
export const loginRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,

  // Use Redis store in production/development; fall back to memory in tests
  /* istanbul ignore next */
  store:
    env.NODE_ENV !== 'test'
      ? new RedisStore({
          // ioredis exposes arbitrary command execution via .call(); cast through
          // unknown to satisfy the RedisReply return type expected by rate-limit-redis
          sendCommand: (...args: string[]) =>
            (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(
              ...args,
            ) as ReturnType<InstanceType<typeof RedisStore>['sendCommand']>,
        })
      : undefined,

  // Return the contract-mandated 429 shape instead of the default plain-text
  /* istanbul ignore next */
  handler: (_req, res) => {
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Too many login attempts. Please try again later.',
      retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
    });
  },
});

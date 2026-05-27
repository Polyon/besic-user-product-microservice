import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { env } from '../config/env';

/**
 * Redis-backed rate limiter applied globally at the Express app level.
 * Falls back to the default in-memory store in test environment so tests
 * never require a live Redis connection for rate-limit counters.
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,

  store:
    /* istanbul ignore next */
    env.NODE_ENV !== 'test'
      ? new RedisStore({
          sendCommand: (...args: string[]) =>
            (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(
              ...args,
            ) as ReturnType<InstanceType<typeof RedisStore>['sendCommand']>,
        })
      : undefined,

  /* istanbul ignore next */
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later' });
  },
});

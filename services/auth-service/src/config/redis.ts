import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

/* istanbul ignore next */
redis.on('connect', () => {
  logger.info('Redis connected');
});

/* istanbul ignore next */
redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

export { redis };

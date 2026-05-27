import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  /* istanbul ignore next */
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty' },
  }),
  ...(env.NODE_ENV === 'test' && {
    level: 'silent',
  }),
});

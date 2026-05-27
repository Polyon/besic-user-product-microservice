import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Redact sensitive values — tokens and credentials must never appear in logs
  redact: {
    paths: ['req.headers.authorization', '*.password', '*.refreshToken', '*.accessToken'],
    censor: '[REDACTED]',
  },
  /* istanbul ignore next */
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty' },
  }),
  ...(env.NODE_ENV === 'test' && {
    level: 'silent',
  }),
});

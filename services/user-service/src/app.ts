import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { userRouter } from './routes/user.routes';
import { internalRouter } from './routes/internal.routes';

const app = express();

// pino-http as first middleware — satisfies FR-010 (structured logging)
app.use(
  pinoHttp({
    logger,
    redact: ['req.headers.authorization'],
    // In test environment suppress pino-http output
    ...(env.NODE_ENV === 'test' && { enabled: false }),
  }),
);

// CORS — parse comma-separated origins; no wildcard in non-development environments
const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(cors({ origin: corsOrigins }));

// JSON body parser
app.use(express.json());

// Routes
app.use('/api/users', userRouter);
app.use('/api/internal', internalRouter);

// Global error handler — MUST be last middleware
app.use(errorHandler);

export { app };

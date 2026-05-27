import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/errorHandler';
import { productRouter } from './routes/product.routes';

export const app = express();

// JSON body parser
app.use(express.json());

// CORS — explicit origin from env; no wildcard * in non-development environments
app.use(
  cors({
    /* istanbul ignore next */
    origin: env.NODE_ENV === 'development' ? env.CORS_ORIGIN : env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Global rate limiter
app.use(rateLimiter);

// All product routes require a valid JWT
app.use('/api/products', authMiddleware, productRouter);

// Global error handler — must be registered last
app.use(errorHandler);


import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { authRouter } from './routes/auth.routes';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

// Parse JSON bodies
app.use(express.json());

// CORS — never allow wildcard in non-development environments (FR-011 / T047)
app.use(
  cors({
    origin: env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? '*' : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// Health check — always available, unauthenticated
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'auth-service' });
});

// Auth routes — rate limiter is applied per-route inside the router (login only)
app.use('/auth', authRouter);

// Global error handler — must be the last middleware registered
app.use(errorHandler);

export { app };

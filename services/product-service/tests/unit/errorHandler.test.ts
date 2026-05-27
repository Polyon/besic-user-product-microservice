/**
 * Unit tests for errorHandler.ts and errors.ts — covers all branches:
 * - ZodError → 400 with details
 * - NotFoundError → 404
 * - ValidationError with details → 400 + details
 * - ValidationError without details → 400 no details
 * - Unknown error in development → 500 with message
 * - Unknown error in non-development → 500 generic message
 */
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { ZodError, z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler';
import { NotFoundError, ValidationError } from '../../src/errors';

/** Build a minimal Express app that throws `err` on GET / and uses errorHandler. */
function makeApp(err: Error) {
  const app = express();
  app.get('/', (_req: Request, _res: Response, next: NextFunction) => next(err));
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// errors.ts — NotFoundError and ValidationError constructors
// ---------------------------------------------------------------------------
describe('NotFoundError', () => {
  it('uses default message when none supplied', () => {
    const e = new NotFoundError();
    expect(e.message).toBe('Resource not found');
    expect(e.statusCode).toBe(404);
    expect(e).toBeInstanceOf(NotFoundError);
  });

  it('uses supplied message', () => {
    const e = new NotFoundError('Widget not found');
    expect(e.message).toBe('Widget not found');
  });
});

describe('ValidationError', () => {
  it('uses default message when none supplied', () => {
    const e = new ValidationError();
    expect(e.message).toBe('Validation failed');
    expect(e.statusCode).toBe(400);
    expect(e.details).toBeUndefined();
  });

  it('stores details array when supplied', () => {
    const e = new ValidationError('Bad input', ['field: required']);
    expect(e.message).toBe('Bad input');
    expect(e.details).toEqual(['field: required']);
  });

  it('details is undefined when not supplied', () => {
    const e = new ValidationError('No details');
    expect(e.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// errorHandler.ts — all branches
// ---------------------------------------------------------------------------
describe('errorHandler — ZodError', () => {
  it('returns 400 with details array for ZodError', async () => {
    // Parse intentionally bad data to produce a ZodError
    let zodErr: ZodError;
    try {
      z.object({ name: z.string() }).parse({ name: 123 });
      throw new Error('should not reach');
    } catch (e) {
      zodErr = e as ZodError;
    }

    const res = await request(makeApp(zodErr)).get('/');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });
});

describe('errorHandler — NotFoundError', () => {
  it('returns 404 with error message', async () => {
    const res = await request(makeApp(new NotFoundError('Widget missing'))).get('/');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Widget missing' });
  });
});

describe('errorHandler — ValidationError', () => {
  it('returns 400 with details when present', async () => {
    const res = await request(
      makeApp(new ValidationError('Bad input', ['price: must be positive'])),
    ).get('/');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad input');
    expect(res.body.details).toEqual(['price: must be positive']);
  });

  it('returns 400 without details field when none provided', async () => {
    const res = await request(makeApp(new ValidationError('Simple error'))).get('/');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Simple error');
    expect(res.body).not.toHaveProperty('details');
  });
});

describe('errorHandler — unhandled Error (500)', () => {
  it('returns 500 with generic message in non-development environment', async () => {
    // NODE_ENV is 'test' in the cached env — always takes the non-development path
    const res = await request(makeApp(new Error('Secret internal failure'))).get('/');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('Secret internal failure');
  });
});

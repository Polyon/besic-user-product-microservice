/**
 * T019 — Contract tests for POST /auth/login
 *
 * Verifies HTTP status codes, response shapes, and error codes
 * as specified in contracts/auth.md.
 *
 * user-client.service is mocked so these tests are fast and deterministic.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import * as userClientService from '../../src/services/user-client.service';
import { storeRefreshToken } from '../../src/services/token.service';
import { redis } from '../../src/config/redis';
import {
  InvalidCredentialsError,
  ServiceUnavailableError,
  TokenExpiredError,
  InvalidTokenError,
  InvalidRefreshTokenError,
} from '../../src/errors';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../../src/services/user-client.service');

const mockVerifyCredentials = jest.mocked(userClientService.verifyCredentials);

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200 — returns token pair and user shape on valid credentials', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
      user: { id: 'user-abc', email: 'jane@example.com' },
    });
  });

  it('200 — refreshToken is UUID v4 format', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('200 — accessToken is a 3-part JWT string', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken.split('.')).toHaveLength(3);
  });

  it('401 — invalid_credentials on wrong password (no enumeration)', async () => {
    mockVerifyCredentials.mockRejectedValueOnce(new InvalidCredentialsError());

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: 'invalid_credentials',
      message: expect.any(String),
    });
  });

  it('401 — invalid_credentials on non-existent email (no enumeration)', async () => {
    mockVerifyCredentials.mockRejectedValueOnce(new InvalidCredentialsError());

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_credentials' });
  });

  it('400 validation_error — missing email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('400 validation_error — invalid email format', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('400 validation_error — missing password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
    );
  });

  it('400 validation_error — empty body', async () => {
    const res = await request(app).post('/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('503 service_unavailable when User Service is down', async () => {
    mockVerifyCredentials.mockRejectedValueOnce(new ServiceUnavailableError());

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'password123' });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'service_unavailable' });
  });

  it('500 internal_server_error on unexpected exception', async () => {
    mockVerifyCredentials.mockRejectedValueOnce(new Error('Unexpected internal failure'));

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'password123' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'internal_server_error' });
  });
});

// ── POST /auth/verify (Phase 4 — T027) ──────────────────────────────────────

describe('POST /auth/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200 — returns userId, email, expiresAt for a valid token', async () => {
    const token = jwt.sign(
      { sub: 'user-abc', email: 'jane@example.com' },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: 900 },
    );

    const res = await request(app)
      .post('/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: 'user-abc',
      email: 'jane@example.com',
      expiresAt: expect.any(String),
    });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('401 unauthorized — no Authorization header', async () => {
    const res = await request(app).post('/auth/verify');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: 'unauthorized',
      message: expect.any(String),
    });
  });

  it('401 unauthorized — Authorization header without Bearer prefix', async () => {
    const token = jwt.sign(
      { sub: 'user-abc', email: 'jane@example.com' },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: 900 },
    );

    const res = await request(app)
      .post('/auth/verify')
      .set('Authorization', token);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthorized' });
  });

  it('401 token_expired — expired access token', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-abc', email: 'jane@example.com' },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: -1 },
    );

    const res = await request(app)
      .post('/auth/verify')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'token_expired' });
  });

  it('401 invalid_token — tampered token signature', async () => {
    const token = jwt.sign(
      { sub: 'user-abc', email: 'jane@example.com' },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: 900 },
    );
    const tampered = token.slice(0, -5) + 'XXXXX';

    const res = await request(app)
      .post('/auth/verify')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_token' });
  });

  it('401 invalid_token — completely invalid token string', async () => {
    const res = await request(app)
      .post('/auth/verify')
      .set('Authorization', 'Bearer not.a.valid.jwt');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_token' });
  });
});

// ── POST /auth/refresh (Phase 5 — T031) ─────────────────────────────────────

describe('POST /auth/refresh', () => {
  let validRefreshToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    await redis.flushall();
    validRefreshToken = await storeRefreshToken('user-abc', 'jane@example.com');
  });

  afterAll(async () => {
    await redis.flushall();
  });

  it('200 — returns new token pair for a valid refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validRefreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
    });
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.refreshToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('200 — new refreshToken is different from the old one (rotation)', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validRefreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(validRefreshToken);
  });

  it('401 invalid_refresh_token — old token rejected after rotation (replay)', async () => {
    // First use — succeeds
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validRefreshToken });

    // Replay the old token — should be rejected
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validRefreshToken });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_refresh_token' });
  });

  it('401 invalid_refresh_token — completely unknown token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'a3f9c2d1-7e4b-4a8f-b1c6-2d3e4f5a6b7c' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_refresh_token' });
  });

  it('400 validation_error — missing refreshToken field', async () => {
    const res = await request(app).post('/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error' });
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'refreshToken' })]),
    );
  });

  it('400 validation_error — empty body', async () => {
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error' });
  });
});

// ── POST /auth/logout (Phase 6 — T036) ─────────────────────────────────────

describe('POST /auth/logout', () => {
  let validRefreshToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    await redis.flushall();
    validRefreshToken = await storeRefreshToken('user-abc', 'jane@example.com');
  });

  afterAll(async () => {
    await redis.flushall();
  });

  it('204 — revokes a valid refresh token', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: validRefreshToken });

    expect(res.status).toBe(204);
  });

  it('204 — idempotent: revoking an already-revoked token still returns 204', async () => {
    await request(app).post('/auth/logout').send({ refreshToken: validRefreshToken });

    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: validRefreshToken });

    expect(res.status).toBe(204);
  });

  it('401 invalid_refresh_token — subsequent refresh fails after logout', async () => {
    await request(app).post('/auth/logout').send({ refreshToken: validRefreshToken });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validRefreshToken });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_refresh_token' });
  });

  it('400 validation_error — missing refreshToken field', async () => {
    const res = await request(app).post('/auth/logout').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error' });
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'refreshToken' })]),
    );
  });

  it('400 validation_error — empty body', async () => {
    const res = await request(app).post('/auth/logout');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error' });
  });
});

// ── Error class shape tests ───────────────────────────────────────────────────

describe('Domain error classes', () => {
  it('TokenExpiredError has correct statusCode and code', () => {
    const err = new TokenExpiredError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('token_expired');
  });

  it('InvalidTokenError has correct statusCode and code', () => {
    const err = new InvalidTokenError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('invalid_token');
  });

  it('InvalidRefreshTokenError has correct statusCode and code', () => {
    const err = new InvalidRefreshTokenError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('invalid_refresh_token');
  });
});



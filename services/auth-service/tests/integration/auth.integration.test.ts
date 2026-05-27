/**
 * T021 — Integration tests for the full login flow.
 *
 * Tests that the POST /auth/login handler:
 *   - returns the expected token pair
 *   - persists the refresh token in Redis with correct payload and TTL
 *   - forwards credentials to verifyCredentials with the right arguments
 *
 * user-client.service is mocked; Redis is provided by ioredis-mock.
 */
import request from 'supertest';
import { app } from '../../src/app';
import * as userClientService from '../../src/services/user-client.service';
import { redis } from '../../src/config/redis';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../../src/services/user-client.service');

const mockVerifyCredentials = jest.mocked(userClientService.verifyCredentials);

describe('Login flow — integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('returns 200 with accessToken, refreshToken, expiresIn, user', async () => {
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

  it('stores the refresh token in Redis after successful login', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    const { refreshToken } = res.body as { refreshToken: string };
    const stored = await redis.get(`auth:refresh:${refreshToken}`);
    expect(stored).not.toBeNull();
  });

  it('stores correct userId and email in Redis payload', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    const { refreshToken } = res.body as { refreshToken: string };
    const stored = await redis.get(`auth:refresh:${refreshToken}`);
    const payload = JSON.parse(stored!) as { userId: string; email: string };

    expect(payload.userId).toBe('user-abc');
    expect(payload.email).toBe('jane@example.com');
  });

  it('sets a positive TTL on the Redis refresh token key', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    const { refreshToken } = res.body as { refreshToken: string };
    const ttl = await redis.ttl(`auth:refresh:${refreshToken}`);
    expect(ttl).toBeGreaterThan(0);
  });

  it('access token contains correct sub and email claims', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    const { accessToken } = res.body as { accessToken: string };
    const parts = accessToken.split('.');
    const payloadJson = Buffer.from(parts[1], 'base64url').toString();
    const payload = JSON.parse(payloadJson) as { sub: string; email: string };

    expect(payload.sub).toBe('user-abc');
    expect(payload.email).toBe('jane@example.com');
  });

  it('calls verifyCredentials with the email and password from the request', async () => {
    mockVerifyCredentials.mockResolvedValueOnce({ id: 'user-abc', email: 'jane@example.com' });

    await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'secret123' });

    expect(mockVerifyCredentials).toHaveBeenCalledWith('jane@example.com', 'secret123');
  });

  it('does not store anything in Redis on invalid credentials', async () => {
    const { InvalidCredentialsError } = await import('../../src/errors');
    mockVerifyCredentials.mockRejectedValueOnce(new InvalidCredentialsError());

    await request(app)
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'wrong' });

    const keys = await redis.keys('auth:refresh:*');
    expect(keys).toHaveLength(0);
  });
});

// ── T049: Full session lifecycle — login → verify → refresh → logout ─────────

describe('Full session lifecycle — login → verify → refresh → logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('completes the full lifecycle without errors', async () => {
    mockVerifyCredentials.mockResolvedValue({ id: 'user-lifecycle', email: 'cycle@example.com' });

    // 1. Login
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'cycle@example.com', password: 'secret' });

    expect(loginRes.status).toBe(200);
    const { accessToken, refreshToken } = loginRes.body as {
      accessToken: string;
      refreshToken: string;
    };

    // 2. Verify the access token
    const verifyRes = await request(app)
      .post('/auth/verify')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toMatchObject({
      userId: 'user-lifecycle',
      email: 'cycle@example.com',
      expiresAt: expect.any(String),
    });

    // 3. Refresh — returns new token pair; old refresh token is revoked
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = refreshRes.body as {
      accessToken: string;
      refreshToken: string;
    };
    expect(newRefreshToken).not.toBe(refreshToken);

    // Old refresh token must be rejected
    const replayRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(replayRes.status).toBe(401);

    // New access token must be valid
    const verifyNewRes = await request(app)
      .post('/auth/verify')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(verifyNewRes.status).toBe(200);

    // 4. Logout
    const logoutRes = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: newRefreshToken });
    expect(logoutRes.status).toBe(204);

    // 4a. Logout is idempotent — second call still returns 204
    const logoutAgainRes = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: newRefreshToken });
    expect(logoutAgainRes.status).toBe(204);

    // 4b. Refresh after logout must fail
    const postLogoutRefreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: newRefreshToken });
    expect(postLogoutRefreshRes.status).toBe(401);

    // 4c. Access token itself is still valid (short-lived — not revoked by logout)
    const postLogoutVerifyRes = await request(app)
      .post('/auth/verify')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(postLogoutVerifyRes.status).toBe(200);
  });
});

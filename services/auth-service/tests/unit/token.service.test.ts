/**
 * T020 — Unit tests for token.service.ts (Phase 3 login path)
 *
 * Tests signAccessToken and storeRefreshToken in isolation using ioredis-mock.
 */
import jwt from 'jsonwebtoken';
import * as tokenService from '../../src/services/token.service';
import { redis } from '../../src/config/redis';
import { TokenExpiredError, InvalidTokenError } from '../../src/errors';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('token.service', () => {
  afterEach(async () => {
    await redis.flushall();
  });

  // ── signAccessToken ─────────────────────────────────────────────────────────

  describe('signAccessToken', () => {
    it('returns a string', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      expect(typeof token).toBe('string');
    });

    it('returns a 3-part JWT (header.payload.signature)', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      expect(token.split('.')).toHaveLength(3);
    });

    it('is verifiable with JWT_SECRET from env', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      expect(() =>
        jwt.verify(token, process.env.JWT_SECRET as string),
      ).not.toThrow();
    });

    it('encodes sub as userId', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const payload = jwt.decode(token) as tokenService.AccessTokenPayload;
      expect(payload.sub).toBe('user-001');
    });

    it('encodes email in payload', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const payload = jwt.decode(token) as tokenService.AccessTokenPayload;
      expect(payload.email).toBe('test@example.com');
    });

    it('sets exp claim in the future', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const payload = jwt.decode(token) as tokenService.AccessTokenPayload;
      expect(payload.exp).toBeGreaterThan(before);
    });

    it('includes iat claim', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const payload = jwt.decode(token) as tokenService.AccessTokenPayload;
      expect(payload.iat).toBeDefined();
    });
  });

  // ── storeRefreshToken ───────────────────────────────────────────────────────

  describe('storeRefreshToken', () => {
    it('returns a string', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      expect(typeof token).toBe('string');
    });

    it('returns a UUID v4 string', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('stores the token under auth:refresh:{uuid} in Redis', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const stored = await redis.get(`auth:refresh:${token}`);
      expect(stored).not.toBeNull();
    });

    it('stores userId in the Redis payload', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const stored = await redis.get(`auth:refresh:${token}`);
      const payload = JSON.parse(stored!) as tokenService.RefreshTokenPayload;
      expect(payload.userId).toBe('user-001');
    });

    it('stores email in the Redis payload', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const stored = await redis.get(`auth:refresh:${token}`);
      const payload = JSON.parse(stored!) as tokenService.RefreshTokenPayload;
      expect(payload.email).toBe('test@example.com');
    });

    it('stores issuedAt ISO timestamp in the Redis payload', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const stored = await redis.get(`auth:refresh:${token}`);
      const payload = JSON.parse(stored!) as tokenService.RefreshTokenPayload;
      expect(payload.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets a positive TTL on the Redis key', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const ttl = await redis.ttl(`auth:refresh:${token}`);
      expect(ttl).toBeGreaterThan(0);
    });

    it('each call generates a unique token', async () => {
      const token1 = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const token2 = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      expect(token1).not.toBe(token2);
    });
  });

  // ── verifyAccessToken (T028) ────────────────────────────────────────────────────

  describe('verifyAccessToken', () => {
    it('returns AccessTokenPayload for a valid token', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const payload = tokenService.verifyAccessToken(token);

      expect(payload.sub).toBe('user-001');
      expect(payload.email).toBe('test@example.com');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('includes iat claim in returned payload', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const payload = tokenService.verifyAccessToken(token);

      expect(payload.iat).toBeDefined();
    });

    it('throws TokenExpiredError for an expired token', () => {
      const expiredToken = jwt.sign(
        { sub: 'user-001', email: 'test@example.com' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', expiresIn: -1 },
      );

      expect(() => tokenService.verifyAccessToken(expiredToken)).toThrow(TokenExpiredError);
    });

    it('throws InvalidTokenError for a token signed with the wrong secret', () => {
      const wrongToken = jwt.sign(
        { sub: 'user-001', email: 'test@example.com' },
        'wrong-secret-key-that-is-definitely-not-real',
        { algorithm: 'HS256', expiresIn: 900 },
      );

      expect(() => tokenService.verifyAccessToken(wrongToken)).toThrow(InvalidTokenError);
    });

    it('throws InvalidTokenError for a tampered token', () => {
      const token = tokenService.signAccessToken('user-001', 'test@example.com');
      const tampered = token.slice(0, -5) + 'ZZZZZ';

      expect(() => tokenService.verifyAccessToken(tampered)).toThrow(InvalidTokenError);
    });

    it('throws InvalidTokenError for a completely invalid string', () => {
      expect(() => tokenService.verifyAccessToken('not.a.jwt')).toThrow(InvalidTokenError);
    });
  });

  // ── getRefreshToken (T032) ──────────────────────────────────────────────────

  describe('getRefreshToken', () => {
    it('returns RefreshTokenPayload for an existing token', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const payload = await tokenService.getRefreshToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe('user-001');
      expect(payload!.email).toBe('test@example.com');
      expect(payload!.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns null for a non-existent token', async () => {
      const payload = await tokenService.getRefreshToken('non-existent-uuid');
      expect(payload).toBeNull();
    });

    it('returns null after the Redis key has been deleted', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      await redis.del(`auth:refresh:${token}`);
      const payload = await tokenService.getRefreshToken(token);
      expect(payload).toBeNull();
    });
  });

  // ── rotateRefreshToken (T032) ───────────────────────────────────────────────

  describe('rotateRefreshToken', () => {
    it('returns a new UUID v4 string', async () => {
      const oldToken = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const newToken = await tokenService.rotateRefreshToken(oldToken, 'user-001', 'test@example.com');

      expect(newToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('new token is different from the old token', async () => {
      const oldToken = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const newToken = await tokenService.rotateRefreshToken(oldToken, 'user-001', 'test@example.com');

      expect(newToken).not.toBe(oldToken);
    });

    it('old token is deleted from Redis after rotation', async () => {
      const oldToken = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      await tokenService.rotateRefreshToken(oldToken, 'user-001', 'test@example.com');

      const oldPayload = await tokenService.getRefreshToken(oldToken);
      expect(oldPayload).toBeNull();
    });

    it('new token is stored in Redis with correct payload', async () => {
      const oldToken = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const newToken = await tokenService.rotateRefreshToken(oldToken, 'user-001', 'test@example.com');

      const newPayload = await tokenService.getRefreshToken(newToken);
      expect(newPayload).not.toBeNull();
      expect(newPayload!.userId).toBe('user-001');
      expect(newPayload!.email).toBe('test@example.com');
    });

    it('replay of old token returns null from getRefreshToken', async () => {
      const oldToken = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      await tokenService.rotateRefreshToken(oldToken, 'user-001', 'test@example.com');

      const replayPayload = await tokenService.getRefreshToken(oldToken);
      expect(replayPayload).toBeNull();
    });

    it('new token has a positive TTL in Redis', async () => {
      const oldToken = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      const newToken = await tokenService.rotateRefreshToken(oldToken, 'user-001', 'test@example.com');

      const ttl = await redis.ttl(`auth:refresh:${newToken}`);
      expect(ttl).toBeGreaterThan(0);
    });
  });

  // ── deleteRefreshToken (T037) ───────────────────────────────────────────────

  describe('deleteRefreshToken', () => {
    it('removes the key from Redis', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      await tokenService.deleteRefreshToken(token);

      const stored = await redis.get(`auth:refresh:${token}`);
      expect(stored).toBeNull();
    });

    it('getRefreshToken returns null after deletion', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      await tokenService.deleteRefreshToken(token);

      const payload = await tokenService.getRefreshToken(token);
      expect(payload).toBeNull();
    });

    it('does not throw when the key does not exist (idempotent)', async () => {
      await expect(
        tokenService.deleteRefreshToken('non-existent-token-uuid'),
      ).resolves.not.toThrow();
    });

    it('does not throw on a second call with the same token (idempotent)', async () => {
      const token = await tokenService.storeRefreshToken('user-001', 'test@example.com');
      await tokenService.deleteRefreshToken(token);

      await expect(tokenService.deleteRefreshToken(token)).resolves.not.toThrow();
    });
  });
});

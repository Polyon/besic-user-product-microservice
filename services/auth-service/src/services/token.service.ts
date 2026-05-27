/**
 * token.service.ts — JWT access-token operations and Redis refresh-token CRUD.
 *
 * Phase 2: Skeleton with types and function signatures only.
 * Implementations are added per-story in Phases 3–6.
 */
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { TokenExpiredError, InvalidTokenError } from '../errors';

/** Stored in Redis at auth:refresh:{uuid} */
export interface RefreshTokenPayload {
  userId: string;   // MongoDB ObjectId string (from User Service)
  email: string;    // Snapshot at issuance time — not used for identity decisions
  issuedAt: string; // ISO 8601
}

/** Decoded JWT access-token payload */
export interface AccessTokenPayload {
  sub: string;   // userId
  email: string;
  iat: number;
  exp: number;
}

// ── Phase 3 (T022) ───────────────────────────────────────────────────────────

/**
 * Sign a short-lived HS256 JWT access token.
 * Payload: { sub, email, iat, exp }
 */
export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

// ── Phase 3 (T023) ───────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 refresh token, store it in Redis with TTL, and return the token.
 * Key: auth:refresh:{uuid}
 */
export async function storeRefreshToken(userId: string, email: string): Promise<string> {
  const token = uuidv4();
  const payload: RefreshTokenPayload = {
    userId,
    email,
    issuedAt: new Date().toISOString(),
  };
  await redis.set(
    `auth:refresh:${token}`,
    JSON.stringify(payload),
    'EX',
    env.JWT_REFRESH_EXPIRES_IN,
  );
  return token;
}

// ── Phase 4 (T029) ───────────────────────────────────────────────────────────

/**
 * Verify a JWT access token. Returns the decoded payload.
 * Throws TokenExpiredError or InvalidTokenError on failure.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    throw new InvalidTokenError();
  }
}

// ── Phase 5 (T033) ───────────────────────────────────────────────────────────

/**
 * Retrieve refresh token payload from Redis.
 * Returns null if the key does not exist (expired, revoked, or replay attempt).
 */
export async function getRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  const data = await redis.get(`auth:refresh:${token}`);
  if (!data) return null;
  return JSON.parse(data) as RefreshTokenPayload;
}

// ── Phase 5 (T034) ───────────────────────────────────────────────────────────

/**
 * Atomically delete the old refresh token and store a new one.
 * Uses a Redis pipeline to minimise the race window.
 */
export async function rotateRefreshToken(
  oldToken: string,
  userId: string,
  email: string,
): Promise<string> {
  const newToken = uuidv4();
  const payload: RefreshTokenPayload = {
    userId,
    email,
    issuedAt: new Date().toISOString(),
  };
  const pipeline = redis.pipeline();
  pipeline.del(`auth:refresh:${oldToken}`);
  pipeline.set(
    `auth:refresh:${newToken}`,
    JSON.stringify(payload),
    'EX',
    env.JWT_REFRESH_EXPIRES_IN,
  );
  await pipeline.exec();
  return newToken;
}

// ── Phase 6 (T038) ───────────────────────────────────────────────────────────

/**
 * Delete a refresh token from Redis. No-op if the key does not exist (idempotent).
 */
export async function deleteRefreshToken(token: string): Promise<void> {
  await redis.del(`auth:refresh:${token}`);
}

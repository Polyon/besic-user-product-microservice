/**
 * T055 — Performance test: POST /auth/verify
 *
 * SC-002: p95 response time for token verification ≤ 50 ms
 *
 * Fires 200 sequential verify requests against the in-process server.
 * No Redis I/O — stateless JWT validation path.
 * Measures wall-clock latency and asserts the p95 is within the SLA.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';

jest.mock('ioredis', () => require('ioredis-mock'));

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret-key-at-least-32-characters-long!!';

function makeToken(userId: string, email: string, expiresIn = 900): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn,
  } as jwt.SignOptions);
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)]!;
}

describe('SC-002 — POST /auth/verify p95 latency ≤ 50 ms', () => {
  const REQUESTS = 200;
  const SLA_MS = 50;

  const token = makeToken('perf-user', 'perf@example.com');

  it(`fires ${REQUESTS} sequential verify requests and p95 is within ${SLA_MS} ms`, async () => {
    const latencies: number[] = [];

    for (let i = 0; i < REQUESTS; i++) {
      const start = performance.now();
      const res = await request(app)
        .post('/auth/verify')
        .set('Authorization', `Bearer ${token}`);
      const elapsed = performance.now() - start;

      expect(res.status).toBe(200);
      latencies.push(elapsed);
    }

    const p95ms = p95(latencies);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;

    console.log(
      `[SC-002] Verify — ${REQUESTS} requests | avg: ${avg.toFixed(2)} ms | p95: ${p95ms.toFixed(2)} ms`,
    );

    expect(p95ms).toBeLessThan(SLA_MS);
  }, 60_000);
});

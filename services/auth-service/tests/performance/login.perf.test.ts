/**
 * T054 — Performance test: POST /auth/login
 *
 * SC-001: p95 response time for login ≤ 2000 ms
 *
 * Fires 50 sequential login requests against the in-process server with a
 * mocked user-client service. Measures wall-clock latency per request and
 * asserts the 95th percentile is within the SLA threshold.
 */
import request from 'supertest';
import { app } from '../../src/app';
import * as userClientService from '../../src/services/user-client.service';
import { redis } from '../../src/config/redis';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../../src/services/user-client.service');

const mockVerifyCredentials = jest.mocked(userClientService.verifyCredentials);

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)]!;
}

describe('SC-001 — POST /auth/login p95 latency ≤ 2000 ms', () => {
  const REQUESTS = 50;
  const SLA_MS = 2000;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyCredentials.mockResolvedValue({ id: 'perf-user', email: 'perf@example.com' });
  });

  afterAll(async () => {
    await redis.flushall();
  });

  it(`fires ${REQUESTS} sequential login requests and p95 is within ${SLA_MS} ms`, async () => {
    const latencies: number[] = [];

    for (let i = 0; i < REQUESTS; i++) {
      const start = performance.now();
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'perf@example.com', password: 'secret123' });
      const elapsed = performance.now() - start;

      expect(res.status).toBe(200);
      latencies.push(elapsed);
    }

    const p95ms = p95(latencies);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;

    console.log(
      `[SC-001] Login — ${REQUESTS} requests | avg: ${avg.toFixed(1)} ms | p95: ${p95ms.toFixed(1)} ms`,
    );

    expect(p95ms).toBeLessThan(SLA_MS);
  }, 120_000);
});

/**
 * T048 — Performance: 500 concurrent GET /api/products requests.
 *
 * SC-005: All 500 concurrent requests complete without error and p95 < 1,000 ms.
 * Uses mongodb-memory-server; no external infrastructure required.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { Product } from '../../src/models/product.model';

jest.mock('../../src/config/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret-key-at-least-32-characters-long!!';
const VALID_TOKEN = jwt.sign({ userId: 'perf-concurrent-user' }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);

let mongod: MongoMemoryServer;

/** Calculate the p95 value from a sorted array of numbers. */
function p95(sorted: number[]): number {
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  await mongoose.connect(mongod.getUri());
  await Product.syncIndexes();

  // Seed a small set so the response is non-trivial
  await Product.insertMany(
    Array.from({ length: 50 }, (_, i) => ({
      name: `Concurrent Product ${i}`,
      price: i + 1,
      category: 'Concurrent',
      stock: 100,
    })),
  );
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('SC-005 — Concurrent GET /api/products performance', () => {
  it('500 concurrent requests all succeed and p95 < 1,000 ms', async () => {
    const CONCURRENT = 500;

    const makeRequest = async (): Promise<number> => {
      const start = Date.now();
      const res = await request(app)
        .get('/api/products?page=1&limit=20')
        .set('Authorization', `Bearer ${VALID_TOKEN}`);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      return elapsed;
    };

    const times = await Promise.all(
      Array.from({ length: CONCURRENT }, makeRequest),
    );

    const sorted = [...times].sort((a, b) => a - b);
    const p95ms = p95(sorted);
    const maxMs = sorted[sorted.length - 1];

    console.log(
      `Concurrent GET p95 (${CONCURRENT} parallel requests): ${p95ms} ms | max: ${maxMs} ms`,
    );

    expect(p95ms).toBeLessThan(1_000);
  }, 120_000);
});

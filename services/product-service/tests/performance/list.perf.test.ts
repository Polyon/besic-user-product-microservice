/**
 * T046 — Performance: GET /api/products list with 10,000 seeded documents.
 *
 * SC-001: p95 response time for list endpoint < 1,000 ms.
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
const VALID_TOKEN = jwt.sign({ userId: 'perf-user' }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);

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

  // Seed 10,000 products in batches of 1,000 to avoid memory pressure
  const TOTAL = 10_000;
  const BATCH = 1_000;
  for (let b = 0; b < TOTAL / BATCH; b++) {
    const docs = Array.from({ length: BATCH }, (_, i) => ({
      name: `Perf Product ${b * BATCH + i}`,
      price: parseFloat((Math.random() * 1000 + 1).toFixed(2)),
      category: 'Performance',
      stock: Math.floor(Math.random() * 500),
    }));
    await Product.insertMany(docs, { ordered: false });
  }
}, 120_000); // allow up to 2 min for seeding

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('SC-001 — GET /api/products list performance (10k docs)', () => {
  it('p95 response time is under 1,000 ms across 20 sequential requests', async () => {
    const times: number[] = [];

    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      const res = await request(app)
        .get('/api/products?page=1&limit=20')
        .set('Authorization', `Bearer ${VALID_TOKEN}`);
      times.push(Date.now() - start);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(10_000);
    }

    times.sort((a, b) => a - b);
    const p95ms = p95(times);

    console.log(`List p95 (20 requests, 10k docs): ${p95ms} ms`);
    expect(p95ms).toBeLessThan(1_000);
  }, 60_000);
});

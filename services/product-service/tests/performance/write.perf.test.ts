/**
 * T047 — Performance: 50 sequential POST, PATCH, and DELETE operations.
 *
 * SC-002: p95 response time for write endpoints < 500 ms each.
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
const VALID_TOKEN = jwt.sign({ userId: 'perf-write-user' }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);

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
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Product.deleteMany({});
});

const ITERATIONS = 50;

describe('SC-002 — Write endpoint performance (50 sequential operations)', () => {
  it(`POST /api/products p95 < 500 ms over ${ITERATIONS} requests`, async () => {
    const times: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = Date.now();
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ name: `WritePerf ${i}`, price: 10 + i, category: 'Perf', stock: i });
      times.push(Date.now() - start);
      expect(res.status).toBe(201);
    }

    times.sort((a, b) => a - b);
    const p95ms = p95(times);
    console.log(`POST p95 (${ITERATIONS} requests): ${p95ms} ms`);
    expect(p95ms).toBeLessThan(500);
  }, 60_000);

  it(`PATCH /api/products/:id p95 < 500 ms over ${ITERATIONS} requests`, async () => {
    // Pre-seed the products we will update
    const docs = await Product.insertMany(
      Array.from({ length: ITERATIONS }, (_, i) => ({
        name: `PatchPerf ${i}`,
        price: 10 + i,
        category: 'Perf',
        stock: i,
      })),
    );

    const times: number[] = [];

    for (const doc of docs) {
      const start = Date.now();
      const res = await request(app)
        .patch(`/api/products/${doc._id.toString()}`)
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ stock: 999 });
      times.push(Date.now() - start);
      expect(res.status).toBe(200);
    }

    times.sort((a, b) => a - b);
    const p95ms = p95(times);
    console.log(`PATCH p95 (${ITERATIONS} requests): ${p95ms} ms`);
    expect(p95ms).toBeLessThan(500);
  }, 60_000);

  it(`DELETE /api/products/:id p95 < 500 ms over ${ITERATIONS} requests`, async () => {
    // Pre-seed the products we will delete
    const docs = await Product.insertMany(
      Array.from({ length: ITERATIONS }, (_, i) => ({
        name: `DeletePerf ${i}`,
        price: 10 + i,
        category: 'Perf',
        stock: i,
      })),
    );

    const times: number[] = [];

    for (const doc of docs) {
      const start = Date.now();
      const res = await request(app)
        .delete(`/api/products/${doc._id.toString()}`)
        .set('Authorization', `Bearer ${VALID_TOKEN}`);
      times.push(Date.now() - start);
      expect(res.status).toBe(200);
    }

    times.sort((a, b) => a - b);
    const p95ms = p95(times);
    console.log(`DELETE p95 (${ITERATIONS} requests): ${p95ms} ms`);
    expect(p95ms).toBeLessThan(500);
  }, 60_000);
});

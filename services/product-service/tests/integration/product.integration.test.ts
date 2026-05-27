/**
 * T039 — Full CRUD lifecycle integration tests.
 * T043 — Auth middleware global coverage test (all 5 routes return 401 without token).
 *
 * Exercises the complete create → list → get → update → delete flow
 * through the real HTTP stack with in-memory MongoDB and mocked Redis.
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

function makeToken(userId = 'integration-user'): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);
}

const VALID_TOKEN = makeToken();
const NONEXISTENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

let mongod: MongoMemoryServer;

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

// ---------------------------------------------------------------------------
// T043 — Auth middleware: all five routes return 401 without a token
// ---------------------------------------------------------------------------
describe('Auth middleware — global coverage across all routes', () => {
  const placeholderId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

  it.each([
    ['GET',    '/api/products'],
    ['GET',    `/api/products/${placeholderId}`],
    ['POST',   '/api/products'],
    ['PATCH',  `/api/products/${placeholderId}`],
    ['DELETE', `/api/products/${placeholderId}`],
  ])('%s %s returns 401 when Authorization header is absent', async (method, path) => {
    const res = await (request(app) as any)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });
});

// ---------------------------------------------------------------------------
// T039 — Full CRUD lifecycle
// ---------------------------------------------------------------------------
describe('Product CRUD — full lifecycle integration', () => {
  const productBody = {
    name: 'Integration Widget',
    description: 'A widget for integration testing',
    price: 49.99,
    category: 'Widgets',
    stock: 200,
  };

  it('create → list → get → update → delete completes without error', async () => {
    // ── CREATE ────────────────────────────────────────────────────────────
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(productBody);

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      id: expect.any(String),
      name: 'Integration Widget',
      price: 49.99,
      category: 'Widgets',
      stock: 200,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(createRes.body).not.toHaveProperty('_id');
    expect(createRes.body).not.toHaveProperty('__v');

    const productId: string = createRes.body.id as string;

    // ── LIST ──────────────────────────────────────────────────────────────
    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toMatchObject({
      data: expect.any(Array),
      total: 1,
      page: 1,
      limit: expect.any(Number),
      totalPages: 1,
    });
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(productId);

    // ── GET BY ID ─────────────────────────────────────────────────────────
    const getRes = await request(app)
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(productId);
    expect(getRes.body.name).toBe('Integration Widget');

    // ── UPDATE ────────────────────────────────────────────────────────────
    const updateRes = await request(app)
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ price: 59.99, stock: 150 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(productId);
    expect(updateRes.body.price).toBe(59.99);
    expect(updateRes.body.stock).toBe(150);
    expect(updateRes.body.name).toBe('Integration Widget'); // unchanged

    // ── DELETE ────────────────────────────────────────────────────────────
    const deleteRes = await request(app)
      .delete(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toMatchObject({ message: 'Product deleted successfully' });

    // ── CONFIRM GONE ──────────────────────────────────────────────────────
    const afterDeleteGet = await request(app)
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(afterDeleteGet.status).toBe(404);

    const afterDeleteList = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(afterDeleteList.body.total).toBe(0);
    expect(afterDeleteList.body.data).toHaveLength(0);
  });

  it('pagination envelope has correct shape and respects page/limit params', async () => {
    // Seed 5 products
    await Product.insertMany([
      { name: 'P1', price: 1, category: 'C', stock: 1 },
      { name: 'P2', price: 2, category: 'C', stock: 1 },
      { name: 'P3', price: 3, category: 'C', stock: 1 },
      { name: 'P4', price: 4, category: 'C', stock: 1 },
      { name: 'P5', price: 5, category: 'C', stock: 1 },
    ]);

    const page1 = await request(app)
      .get('/api/products?page=1&limit=2')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.totalPages).toBe(3);
    expect(page1.body.page).toBe(1);
    expect(page1.body.limit).toBe(2);

    const page2 = await request(app)
      .get('/api/products?page=2&limit=2')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.page).toBe(2);
  });

  it('404 on write operations targeting a nonexistent product ID', async () => {
    const patchRes = await request(app)
      .patch(`/api/products/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ price: 9.99 });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/products/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(deleteRes.status).toBe(404);

    const getRes = await request(app)
      .get(`/api/products/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(getRes.status).toBe(404);
  });

  it('all 401 error responses have the correct contract shape', async () => {
    const routes = [
      ['get',    '/api/products'],
      ['post',   '/api/products'],
      ['get',    `/api/products/${NONEXISTENT_ID}`],
      ['patch',  `/api/products/${NONEXISTENT_ID}`],
      ['delete', `/api/products/${NONEXISTENT_ID}`],
    ] as const;

    for (const [method, path] of routes) {
      const res = await (request(app) as any)[method](path);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
      expect(res.body).not.toHaveProperty('stack');
    }
  });
});

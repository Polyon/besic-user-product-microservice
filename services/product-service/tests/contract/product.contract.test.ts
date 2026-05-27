/**
 * T020 — Contract tests for GET /api/products (list)
 * T021 — Contract tests for GET /api/products/:id (single)
 *
 * Verifies HTTP status codes and response shapes against contracts/products.md.
 * Uses MongoMemoryServer for isolated in-memory MongoDB.
 * ioredis is mocked so no real Redis is needed.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { Product } from '../../src/models/product.model';

// Mock ioredis — rate-limiter uses in-memory fallback in test env (NODE_ENV=test)
jest.mock('../../src/config/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret-key-at-least-32-characters-long!!';

function makeToken(userId = 'user-001'): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);
}

const VALID_TOKEN = makeToken();

// A fixed 24-hex ObjectId that does NOT exist in the DB
const NONEXISTENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const INVALID_ID = 'not-an-objectid';

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
// T020 — GET /api/products
// ---------------------------------------------------------------------------
describe('GET /api/products', () => {
  it('401 — missing Authorization header', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('401 — malformed token', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('401 — expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-expired' },
      JWT_SECRET,
      { expiresIn: -1 } as jwt.SignOptions,
    );
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('200 — empty DB returns empty data array with pagination envelope', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it('200 — seeded DB returns paginated shape with default page/limit', async () => {
    await Product.create([
      { name: 'Widget A', price: 9.99, category: 'Widgets', stock: 10 },
      { name: 'Widget B', price: 19.99, category: 'Widgets', stock: 5 },
    ]);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    // Each item has the full product shape
    expect(res.body.data[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      price: expect.any(Number),
      category: expect.any(String),
      stock: expect.any(Number),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body.data[0]).not.toHaveProperty('_id');
    expect(res.body.data[0]).not.toHaveProperty('__v');
  });

  it('200 — respects custom page and limit query params', async () => {
    // Seed 5 products
    await Product.create([
      { name: 'P1', price: 1, category: 'Cat', stock: 1 },
      { name: 'P2', price: 2, category: 'Cat', stock: 2 },
      { name: 'P3', price: 3, category: 'Cat', stock: 3 },
      { name: 'P4', price: 4, category: 'Cat', stock: 4 },
      { name: 'P5', price: 5, category: 'Cat', stock: 5 },
    ]);

    const res = await request(app)
      .get('/api/products?page=2&limit=2')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
    });
    expect(res.body.data).toHaveLength(2);
  });

  it('400 — invalid page=0 returns validation error', async () => {
    const res = await request(app)
      .get('/api/products?page=0')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('400 — limit > 100 returns validation error', async () => {
    const res = await request(app)
      .get('/api/products?limit=200')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// T021 — GET /api/products/:id
// ---------------------------------------------------------------------------
describe('GET /api/products/:id', () => {
  it('401 — missing Authorization header', async () => {
    const res = await request(app).get(`/api/products/${NONEXISTENT_ID}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('400 — invalid ObjectId format returns 400', async () => {
    const res = await request(app)
      .get(`/api/products/${INVALID_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('404 — valid ObjectId that does not exist', async () => {
    const res = await request(app)
      .get(`/api/products/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('200 — returns full product shape for an existing product', async () => {
    const created = await Product.create({
      name: 'Wireless Keyboard',
      description: 'Compact 75% layout, RGB backlit',
      price: 79.99,
      category: 'Electronics',
      stock: 150,
    });

    const res = await request(app)
      .get(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created._id.toString(),
      name: 'Wireless Keyboard',
      description: 'Compact 75% layout, RGB backlit',
      price: 79.99,
      category: 'Electronics',
      stock: 150,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });
});

// ---------------------------------------------------------------------------
// T027 — POST /api/products
// ---------------------------------------------------------------------------
describe('POST /api/products', () => {
  const validBody = {
    name: 'Wireless Keyboard',
    description: 'Compact 75% layout, RGB backlit',
    price: 79.99,
    category: 'Electronics',
    stock: 150,
  };

  it('401 — missing Authorization header', async () => {
    const res = await request(app).post('/api/products').send(validBody);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('201 — valid body returns created product shape', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Wireless Keyboard',
      description: 'Compact 75% layout, RGB backlit',
      price: 79.99,
      category: 'Electronics',
      stock: 150,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('201 — created product is immediately retrievable via GET', async () => {
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(validBody);

    expect(createRes.status).toBe(201);
    const { id } = createRes.body as { id: string };

    const getRes = await request(app)
      .get(`/api/products/${id}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({ id, name: 'Wireless Keyboard' });
  });

  it('201 — description is optional; omitting it succeeds', async () => {
    const { description: _d, ...bodyWithoutDesc } = validBody;
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(bodyWithoutDesc);

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('description');
  });

  it('400 — missing name returns validation error with details', async () => {
    const { name: _n, ...body } = validBody;
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('details');
  });

  it('400 — missing price returns validation error', async () => {
    const { price: _p, ...body } = validBody;
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('400 — negative price is rejected', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ ...validBody, price: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('400 — negative stock is rejected', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ ...validBody, stock: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('unknown fields are silently stripped and product is still created', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ ...validBody, extraField: 'should be stripped' });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('extraField');
  });
});

// ---------------------------------------------------------------------------
// T031 — PATCH /api/products/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/products/:id', () => {
  const base = {
    name: 'Original Name',
    description: 'Original description',
    price: 49.99,
    category: 'Electronics',
    stock: 100,
  };

  it('401 — missing Authorization header', async () => {
    const res = await request(app)
      .patch(`/api/products/${NONEXISTENT_ID}`)
      .send({ price: 59.99 });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('400 — invalid ObjectId format', async () => {
    const res = await request(app)
      .patch(`/api/products/${INVALID_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ price: 59.99 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('400 — empty body is rejected', async () => {
    const created = await Product.create(base);
    const res = await request(app)
      .patch(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('400 — price: 0 is rejected (must be positive)', async () => {
    const created = await Product.create(base);
    const res = await request(app)
      .patch(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ price: 0 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('404 — valid ObjectId that does not exist', async () => {
    const res = await request(app)
      .patch(`/api/products/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ price: 59.99 });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('200 — single-field update returns full updated product shape', async () => {
    const created = await Product.create(base);
    const res = await request(app)
      .patch(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ price: 69.99 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created._id.toString(),
      name: 'Original Name',
      price: 69.99,
      category: 'Electronics',
      stock: 100,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('200 — unchanged fields retain their original values', async () => {
    const created = await Product.create(base);
    const res = await request(app)
      .patch(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ stock: 200 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Original Name');       // unchanged
    expect(res.body.price).toBe(49.99);                // unchanged
    expect(res.body.category).toBe('Electronics');     // unchanged
    expect(res.body.stock).toBe(200);                  // updated
  });

  it('200 — updatedAt is newer than createdAt after patch', async () => {
    const created = await Product.create(base);
    // small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app)
      .patch(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    const updatedAt = new Date(res.body.updatedAt as string).getTime();
    const createdAt = new Date(res.body.createdAt as string).getTime();
    expect(updatedAt).toBeGreaterThanOrEqual(createdAt);
  });
});

// ---------------------------------------------------------------------------
// T035 — DELETE /api/products/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/products/:id', () => {
  const base = {
    name: 'To Be Deleted',
    price: 9.99,
    category: 'Disposables',
    stock: 10,
  };

  it('401 — missing Authorization header', async () => {
    const res = await request(app)
      .delete(`/api/products/${NONEXISTENT_ID}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('400 — invalid ObjectId format', async () => {
    const res = await request(app)
      .delete(`/api/products/${INVALID_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('404 — valid ObjectId that does not exist', async () => {
    const res = await request(app)
      .delete(`/api/products/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('200 — returns success message on valid delete', async () => {
    const created = await Product.create(base);
    const res = await request(app)
      .delete(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Product deleted successfully' });
  });

  it('404 — subsequent GET for deleted product returns 404', async () => {
    const created = await Product.create(base);
    await request(app)
      .delete(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    const res = await request(app)
      .get(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('200 — deleted product no longer appears in list', async () => {
    const created = await Product.create(base);
    await request(app)
      .delete(`/api/products/${created._id.toString()}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    const ids = (listRes.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(created._id.toString());
  });
});

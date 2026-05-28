import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { getUser, setUser, invalidateUser } from '../../src/cache/user.cache';

// Mock the cache module so tests don't need a real Redis server.
// Phase 3 (POST) tests are unaffected — they never call cache functions.
jest.mock('../../src/cache/user.cache', () => ({
  getUser: jest.fn(),
  setUser: jest.fn(),
  invalidateUser: jest.fn(),
}));

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret-key-at-least-32-characters-long!!';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key]!.deleteMany({});
  }
  jest.clearAllMocks();
});

describe('POST /api/users — Register a New User', () => {
  const validPayload = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'secureP@ssw0rd',
  };

  it('should create a user and return 201 with public profile', async () => {
    const res = await request(app).post('/api/users').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Jane Doe',
      email: 'jane@example.com',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('should lowercase email before storing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ ...validPayload, email: 'Jane@Example.COM' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('jane@example.com');
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jane@example.com', password: 'secureP@ssw0rd' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation error');
    expect(res.body).toHaveProperty('details');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('should return 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Jane Doe', email: 'not-an-email', password: 'secureP@ssw0rd' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation error');
  });

  it('should return 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Jane Doe', email: 'jane@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation error');
  });

  it('should return 409 when email is already registered', async () => {
    // First registration
    await request(app).post('/api/users').send(validPayload);

    // Duplicate
    const res = await request(app).post('/api/users').send(validPayload);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Email already in use');
  });

  it('should silently strip unknown fields from request body', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ ...validPayload, role: 'admin', isVerified: true });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('role');
    expect(res.body).not.toHaveProperty('isVerified');
  });
});

describe('GET /api/users/:id — Get Own Profile', () => {
  const payload = { name: 'Jane Doe', email: 'jane@example.com', password: 'secureP@ssw0rd' };

  async function registerUser() {
    const res = await request(app).post('/api/users').send(payload);
    return res.body as { id: string; name: string; email: string };
  }

  function makeToken(userId: string, email: string, expiresIn: string | number = '1h') {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn } as jwt.SignOptions);
  }

  beforeEach(() => {
    // Default: cache miss
    (getUser as jest.Mock).mockResolvedValue(null);
    (setUser as jest.Mock).mockResolvedValue(undefined);
  });

  it('should return 200 with public profile on cache miss (fetches from MongoDB)', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .get(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      name: 'Jane Doe',
      email: 'jane@example.com',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(setUser).toHaveBeenCalledWith(user.id, expect.any(Object));
  });

  it('should return 200 with profile on cache hit (served from Redis)', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);
    const cached = { id: user.id, name: 'Jane Doe', email: 'jane@example.com', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    (getUser as jest.Mock).mockResolvedValueOnce(cached);

    const res = await request(app)
      .get(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, name: 'Jane Doe' });
    // setUser should NOT be called on a cache hit
    expect(setUser).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is missing', async () => {
    const user = await registerUser();

    const res = await request(app).get(`/api/users/${user.id}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorised');
  });

  it('should return 401 when token is expired', async () => {
    const user = await registerUser();
    const expiredToken = makeToken(user.id, user.email, -1);

    const res = await request(app)
      .get(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorised');
  });

  it('should return 403 when token userId does not match path id', async () => {
    const user = await registerUser();
    const otherId = new mongoose.Types.ObjectId().toString();
    const token = makeToken(otherId, 'other@example.com');

    const res = await request(app)
      .get(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden');
  });

  it('should return 404 when user does not exist in database', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const token = makeToken(nonExistentId, 'ghost@example.com');

    const res = await request(app)
      .get(`/api/users/${nonExistentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });

  it('should return 400 for an invalid MongoDB ObjectId', async () => {
    const token = makeToken('not-an-id', 'x@example.com');

    const res = await request(app)
      .get('/api/users/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/users/:id — Update Own Profile', () => {
  const payload = { name: 'Jane Doe', email: 'jane@example.com', password: 'secureP@ssw0rd' };

  async function registerUser() {
    const res = await request(app).post('/api/users').send(payload);
    return res.body as { id: string; name: string; email: string };
  }

  function makeToken(userId: string, email: string) {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);
  }

  beforeEach(() => {
    (invalidateUser as jest.Mock).mockResolvedValue(undefined);
    (getUser as jest.Mock).mockResolvedValue(null);
  });

  it('should return 200 with updated name', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jane Smith' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      name: 'Jane Smith',
      email: 'jane@example.com',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('should return 200 and update password (re-hashed)', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'newSecureP@ss1' });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('should invalidate the cache after a successful update', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jane Smith' });

    expect(invalidateUser).toHaveBeenCalledWith(user.id);
  });

  it('should return 400 when body is empty', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'At least one field must be provided');
  });

  it('should return 401 when Authorization header is missing', async () => {
    const user = await registerUser();

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .send({ name: 'Jane Smith' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorised');
  });

  it('should return 403 when token userId does not match path id', async () => {
    const user = await registerUser();
    const otherId = new mongoose.Types.ObjectId().toString();
    const token = makeToken(otherId, 'other@example.com');

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacker' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden');
  });

  it('should return 409 when new email is already registered to another user', async () => {
    // Register two users
    await registerUser();
    const res2 = await request(app)
      .post('/api/users')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'secureP@ssw0rd' });
    const bob = res2.body as { id: string; email: string };
    const bobToken = makeToken(bob.id, bob.email);

    // Bob tries to change his email to Jane's
    const res = await request(app)
      .patch(`/api/users/${bob.id}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ email: 'jane@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Email already in use');
  });

  it('should return 400 for an invalid MongoDB ObjectId', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .patch('/api/users/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jane Smith' });

    expect(res.status).toBe(400);
  });

  it('should return 400 with details for field-level validation failure', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });  // violates min(1) but is not empty body

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation error');
    expect(Array.isArray(res.body.details)).toBe(true);
  });
});

describe('DELETE /api/users/:id — Delete Own Account', () => {
  const payload = { name: 'Jane Doe', email: 'jane@example.com', password: 'secureP@ssw0rd' };

  async function registerUser() {
    const res = await request(app).post('/api/users').send(payload);
    return res.body as { id: string; name: string; email: string };
  }

  function makeToken(userId: string, email: string) {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);
  }

  beforeEach(() => {
    (invalidateUser as jest.Mock).mockResolvedValue(undefined);
    (getUser as jest.Mock).mockResolvedValue(null);
  });

  it('should return 200 with confirmation message on successful deletion', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Account deleted successfully');
  });

  it('should invalidate the cache after a successful deletion', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(invalidateUser).toHaveBeenCalledWith(user.id);
  });

  it('should return 404 on subsequent GET after deletion', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });

  it('should return 401 when Authorization header is missing', async () => {
    const user = await registerUser();

    const res = await request(app).delete(`/api/users/${user.id}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorised');
  });

  it('should return 403 when token userId does not match path id', async () => {
    const user = await registerUser();
    const otherId = new mongoose.Types.ObjectId().toString();
    const token = makeToken(otherId, 'other@example.com');

    const res = await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden');
  });

  it('should return 404 when user does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const token = makeToken(nonExistentId, 'ghost@example.com');

    const res = await request(app)
      .delete(`/api/users/${nonExistentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });

  it('should return 400 for an invalid MongoDB ObjectId', async () => {
    const user = await registerUser();
    const token = makeToken(user.id, user.email);

    const res = await request(app)
      .delete('/api/users/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ── POST /api/internal/verify-credentials (T041) ────────────────────────────

describe('POST /api/internal/verify-credentials', () => {
  const INTERNAL_API_KEY = 'test-internal-api-key';
  const validPayload = { email: 'jane@example.com', password: 'secureP@ssw0rd' };

  beforeEach(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_API_KEY;
    await request(app).post('/api/users').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'secureP@ssw0rd',
    });
  });

  it('200 — returns { id, email } for valid key and correct credentials', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .set('X-Internal-Api-Key', INTERNAL_API_KEY)
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      email: 'jane@example.com',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('401 — wrong password returns generic invalid_credentials', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .set('X-Internal-Api-Key', INTERNAL_API_KEY)
      .send({ email: 'jane@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid credentials' });
  });

  it('401 — unknown email returns generic invalid_credentials (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .set('X-Internal-Api-Key', INTERNAL_API_KEY)
      .send({ email: 'nobody@example.com', password: 'secureP@ssw0rd' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid credentials' });
  });

  it('401 — missing X-Internal-Api-Key header', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .send(validPayload);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('401 — wrong API key', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .set('X-Internal-Api-Key', 'not-the-right-key')
      .send(validPayload);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorised' });
  });

  it('400 — missing email field', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .set('X-Internal-Api-Key', INTERNAL_API_KEY)
      .send({ password: 'secureP@ssw0rd' });

    expect(res.status).toBe(400);
  });

  it('400 — missing password field', async () => {
    const res = await request(app)
      .post('/api/internal/verify-credentials')
      .set('X-Internal-Api-Key', INTERNAL_API_KEY)
      .send({ email: 'jane@example.com' });

    expect(res.status).toBe(400);
  });
});

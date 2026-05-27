import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { User } from '../../src/models/user.model';

// Use ioredis-mock so cache operations work in-memory without a real Redis server
jest.mock('../../src/config/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret-key-at-least-32-characters-long!!';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

describe('Full user lifecycle integration', () => {
  it('register → GET (miss) → GET (hit) → PATCH → GET updated → DELETE → GET 404', async () => {
    // Step 1: Register
    const registerRes = await request(app)
      .post('/api/users')
      .send({ name: 'Jane Doe', email: 'jane@example.com', password: 'secureP@ssw0rd' });

    expect(registerRes.status).toBe(201);
    const { id, email } = registerRes.body as { id: string; email: string };
    expect(id).toBeTruthy();
    expect(registerRes.body).not.toHaveProperty('passwordHash');

    // Step 2: Sign JWT directly — no running Auth Service required
    const token = jwt.sign({ userId: id, email }, JWT_SECRET, { expiresIn: '1h' } as jwt.SignOptions);

    // Step 3: GET profile (cache miss — result written to ioredis-mock)
    const getRes1 = await request(app)
      .get(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes1.status).toBe(200);
    expect(getRes1.body).toMatchObject({ id, name: 'Jane Doe', email: 'jane@example.com' });
    expect(getRes1.body).not.toHaveProperty('passwordHash');

    // Step 4: GET profile again (cache hit — served from ioredis-mock)
    const getRes2 = await request(app)
      .get(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes2.status).toBe(200);
    expect(getRes2.body).toMatchObject({ id, name: 'Jane Doe', email: 'jane@example.com' });

    // Step 5: PATCH name (cache invalidated after write)
    const patchRes = await request(app)
      .patch(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jane Smith' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body).toMatchObject({ id, name: 'Jane Smith', email: 'jane@example.com' });

    // Step 6: GET profile — cache was invalidated, fetches updated record from MongoDB
    const getRes3 = await request(app)
      .get(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes3.status).toBe(200);
    expect(getRes3.body).toMatchObject({ id, name: 'Jane Smith', email: 'jane@example.com' });

    // Step 7: DELETE account
    const deleteRes = await request(app)
      .delete(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty('message', 'Account deleted successfully');

    // Step 8: GET after deletion — must return 404
    const getRes4 = await request(app)
      .get(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes4.status).toBe(404);
    expect(getRes4.body).toHaveProperty('error', 'User not found');
  });
});

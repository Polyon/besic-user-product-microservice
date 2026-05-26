import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../../src/models/user.model';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes(); // ensure unique index on email is active
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

describe('User model toJSON transform', () => {
  it('should rename _id to id in JSON output', async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashed_password_value',
    });

    const json = user.toJSON() as unknown as Record<string, unknown>;

    expect(json.id).toBeDefined();
    expect(json.id).toBe(user._id.toString());
    expect(json._id).toBeUndefined();
  });

  it('should remove passwordHash from JSON output', async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'nopw@example.com',
      passwordHash: 'super_secret_hash',
    });

    const json = user.toJSON() as unknown as Record<string, unknown>;

    expect(json.passwordHash).toBeUndefined();
  });

  it('should remove __v from JSON output', async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'nov@example.com',
      passwordHash: 'some_hash',
    });

    const json = user.toJSON() as unknown as Record<string, unknown>;

    expect(json.__v).toBeUndefined();
  });

  it('should include name, email, createdAt, updatedAt in JSON output', async () => {
    const user = await User.create({
      name: 'Jane Doe',
      email: 'jane@example.com',
      passwordHash: 'hash123',
    });

    const json = user.toJSON() as unknown as Record<string, unknown>;

    expect(json.name).toBe('Jane Doe');
    expect(json.email).toBe('jane@example.com');
    expect(json.createdAt).toBeDefined();
    expect(json.updatedAt).toBeDefined();
  });

  it('should enforce unique email index (code 11000 on duplicate)', async () => {
    await User.create({
      name: 'User One',
      email: 'duplicate@example.com',
      passwordHash: 'hash1',
    });

    await expect(
      User.create({
        name: 'User Two',
        email: 'duplicate@example.com',
        passwordHash: 'hash2',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('should lowercase email before storage', async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'UPPER@EXAMPLE.COM',
      passwordHash: 'hash',
    });

    expect(user.email).toBe('upper@example.com');
  });
});

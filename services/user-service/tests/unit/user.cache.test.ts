// Mock ioredis with ioredis-mock so no real Redis server is needed.
// The redis.ts singleton will receive a _RedisMock instance instead.
jest.mock('../../src/config/redis', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RedisMock = require('ioredis-mock') as new () => {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ex: string, ttl: number): Promise<'OK'>;
    del(key: string): Promise<number>;
    flushall(): Promise<'OK'>;
  };
  return { redis: new RedisMock() };
});

import { redis } from '../../src/config/redis';
import { getUser, setUser, invalidateUser } from '../../src/cache/user.cache';

afterEach(async () => {
  await redis.flushall();
});

describe('user cache helpers', () => {
  const userId = '664f1a2b3c4d5e6f7a8b9c0d';
  const userObject = {
    id: userId,
    name: 'Jane Doe',
    email: 'jane@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('getUser', () => {
    it('should return null on cache miss', async () => {
      const result = await getUser(userId);
      expect(result).toBeNull();
    });

    it('should return parsed object on cache hit', async () => {
      await redis.set(`user:${userId}`, JSON.stringify(userObject), 'EX', 300);

      const result = await getUser(userId);

      expect(result).toMatchObject({
        id: userId,
        name: 'Jane Doe',
        email: 'jane@example.com',
      });
    });
  });

  describe('setUser', () => {
    it('should serialise user to JSON and store with TTL', async () => {
      await setUser(userId, userObject as Record<string, unknown>);

      const raw = await redis.get(`user:${userId}`);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as Record<string, unknown>;
      expect(parsed).toMatchObject({ id: userId, name: 'Jane Doe' });
    });

    it('should use the key format user:{id}', async () => {
      await setUser(userId, userObject as Record<string, unknown>);

      // Key must match the cache key pattern
      const raw = await redis.get(`user:${userId}`);
      expect(raw).not.toBeNull();
    });
  });

  describe('invalidateUser', () => {
    it('should delete the cache key', async () => {
      await setUser(userId, userObject as Record<string, unknown>);

      await invalidateUser(userId);

      const result = await getUser(userId);
      expect(result).toBeNull();
    });
  });
});

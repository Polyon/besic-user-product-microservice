import { redis } from '../config/redis';
import { env } from '../config/env';

export async function getUser(id: string): Promise<Record<string, unknown> | null> {
  const data = await redis.get(`user:${id}`);
  if (!data) return null;
  return JSON.parse(data) as Record<string, unknown>;
}

export async function setUser(id: string, user: Record<string, unknown>): Promise<void> {
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', env.CACHE_TTL_SECONDS);
}

export async function invalidateUser(id: string): Promise<void> {
  await redis.del(`user:${id}`);
}

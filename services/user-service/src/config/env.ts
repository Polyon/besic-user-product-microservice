import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('3001' as unknown as number),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CACHE_TTL_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('300' as unknown as number),
  BCRYPT_COST: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('12' as unknown as number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors;
  console.error('Invalid environment variables:', errors);
  process.exit(1);
}

export const env = parsed.data;

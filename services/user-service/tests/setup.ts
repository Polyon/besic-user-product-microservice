// Jest global test setup — sets required environment variables before any module imports.
// This runs before each test file, ensuring env.ts validation passes in test environment.

process.env.PORT = '3001';
process.env.MONGODB_URI = 'mongodb://localhost:27017/user-service-test';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CACHE_TTL_SECONDS = '300';
process.env.BCRYPT_COST = '10'; // lower cost for faster tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.INTERNAL_API_KEY = 'test-internal-api-key';

// Jest global test setup — sets required environment variables before any module imports.
// This runs before each test file, ensuring env.ts validation passes in test environment.

process.env.PORT = '3001';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
process.env.JWT_ACCESS_EXPIRES_IN = '900';
process.env.JWT_REFRESH_EXPIRES_IN = '604800';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.USER_SERVICE_URL = 'http://localhost:3000';
process.env.INTERNAL_API_KEY = 'test-internal-api-key';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000'; // High limit so tests never trigger rate-limiting
process.env.NODE_ENV = 'test';

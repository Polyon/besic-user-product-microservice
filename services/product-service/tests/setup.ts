// Jest global test setup — sets required environment variables before any module imports.
// This runs before each test file (via jest.config.ts `setupFiles`), ensuring
// env.ts validation passes in the test environment.

process.env['PORT'] = '3003';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/product-service-test';
process.env['JWT_SECRET'] = 'test-secret-key-at-least-32-characters-long!!';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['RATE_LIMIT_WINDOW_MS'] = '60000';
process.env['RATE_LIMIT_MAX'] = '10000'; // High limit so tests never trigger rate limiting
process.env['CORS_ORIGIN'] = 'http://localhost:3000';
process.env['LOG_LEVEL'] = 'silent';
process.env['NODE_ENV'] = 'test';


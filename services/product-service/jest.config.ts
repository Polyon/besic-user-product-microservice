import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',       // entry point — not testable in isolation
    '!src/config/db.ts',    // Mongoose connection — always mocked in tests
    '!src/config/redis.ts', // ioredis client — always mocked in tests
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,   // mongodb-memory-server can be slow to start
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setup.ts'],
};

export default config;

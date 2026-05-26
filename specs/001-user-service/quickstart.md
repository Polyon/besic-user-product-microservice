# Quickstart: Simple User Service

**Branch**: `001-user-service` | **Date**: 2026-05-26  
**Prerequisites**: Docker Desktop, Node.js ≥ 20 LTS, npm or pnpm

---

## 1. Clone and Navigate

```bash
git clone <repo-url>
cd <repo-root>
git checkout 001-user-service
cd services/user-service
```

---

## 2. Install Dependencies

```bash
npm install
# or
pnpm install
```

---

## 3. Configure Environment

Copy the example env file and fill in the required values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Server
PORT=3001
NODE_ENV=development

# MongoDB — use the docker-compose service name when running in Docker
MONGODB_URI=mongodb://localhost:27017/user-service-db

# JWT — must match the secret used by the Authentication Service
JWT_SECRET=change-me-to-a-256-bit-random-secret

# Redis — use the docker-compose service name when running in Docker
REDIS_URL=redis://localhost:6379

# Cache
CACHE_TTL_SECONDS=300

# Security
BCRYPT_COST=12

# Logging
LOG_LEVEL=debug
```

> **Never commit `.env` to version control.** Only `.env.example` (with placeholder values) is committed.

---

## 4. Start Infrastructure with Docker Compose

From the **repository root** (not the service directory):

```bash
docker compose up -d mongodb redis
```

This starts MongoDB and Redis in the background. The `docker-compose.yml` at the
repository root defines all shared infrastructure for local development.

---

## 5. Run the Service (development mode)

```bash
npm run dev
# or
pnpm dev
```

This runs `ts-node` (or `tsx`) in watch mode. The service listens on `http://localhost:3001`.

---

## 6. Run Tests

```bash
# All tests (unit + integration + contract)
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests use `mongodb-memory-server` and `ioredis-mock` — no running MongoDB or Redis is
required to execute the test suite.

Minimum coverage gate: **80 %** (enforced in CI).

---

## 7. Verify the Service is Running

```bash
# Registration (public endpoint — no auth required)
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"secureP@ss1"}'

# Expected: 201 Created with user object (no password field)
```

---

## 8. Build for Production

```bash
npm run build
# Compiles TypeScript to dist/
```

The compiled output is in `dist/`. The Dockerfile uses this build step:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
EXPOSE 3001
CMD ["node", "dist/app.js"]
```

Build and run the Docker image:

```bash
docker build -t user-service .
docker run --env-file .env -p 3001:3001 user-service
```

---

## 9. Key npm Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/app.js` (production) |
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier format |

---

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `MongoServerError: connect ECONNREFUSED` | MongoDB not running | `docker compose up -d mongodb` |
| `Error: connect ECONNREFUSED redis` | Redis not running | `docker compose up -d redis` |
| `JsonWebTokenError: invalid signature` | `JWT_SECRET` mismatch between User and Auth services | Ensure both services use the identical `JWT_SECRET` value |
| `401 Unauthorized` on protected endpoints | Token missing or expired | Include `Authorization: Bearer <token>` header with a fresh token from the Auth Service |
| TypeScript strict errors | Missing type annotations | Run `npm run build` to see all TS errors before committing |

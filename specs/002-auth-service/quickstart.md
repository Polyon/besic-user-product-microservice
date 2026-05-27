# Quickstart: Authentication Service

**Branch**: `002-auth-service` | **Date**: 2026-05-27  
**Prerequisites**: Docker Desktop, Node.js ≥ 20 LTS, npm or pnpm  
**Depends on**: User Service running and reachable (see [001-user-service quickstart](../../001-user-service/quickstart.md))

---

## 1. Clone and Navigate

```bash
git clone <repo-url>
cd <repo-root>
git checkout 002-auth-service
cd services/auth-service
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

# JWT — MUST be the same secret configured in every service that verifies tokens
JWT_SECRET=change-me-to-a-256-bit-random-secret-at-least-32-chars

# Token expiry (seconds)
JWT_ACCESS_EXPIRES_IN=900       # 15 minutes
JWT_REFRESH_EXPIRES_IN=604800   # 7 days

# Redis — use docker-compose service name when running in Docker
REDIS_URL=redis://localhost:6379

# User Service — base URL reachable from this service
USER_SERVICE_URL=http://localhost:3000

# Internal API key — MUST match the value set in the User Service
INTERNAL_API_KEY=change-me-to-a-random-secret

# Rate limiting (login endpoint)
RATE_LIMIT_WINDOW_MS=900000     # 15 minutes
RATE_LIMIT_MAX=10               # max attempts per window

# Logging
LOG_LEVEL=debug
```

> **Never commit `.env` to version control.** Only `.env.example` (with placeholder values) is committed.

---

## 4. Start Infrastructure with Docker Compose

From the **repository root**:

```bash
docker compose up -d redis user-service
```

This starts Redis and the User Service. The Auth Service communicates with the User Service
over the internal Docker network using the service name `user-service`.

To start all services (including Auth Service) at once:

```bash
docker compose up -d
```

---

## 5. Run the Service (Development Mode)

With infrastructure running, start the Auth Service directly:

```bash
npm run dev
```

The service starts on `http://localhost:3001` by default.

---

## 6. Run Tests

**Unit tests only** (no external dependencies):

```bash
npm test -- --testPathPattern=unit
```

**Integration tests** (requires Redis via `ioredis-mock` — no real Redis needed):

```bash
npm test -- --testPathPattern=integration
```

**Contract tests** (spins up the Express app with Supertest):

```bash
npm test -- --testPathPattern=contract
```

**All tests with coverage**:

```bash
npm test -- --coverage
```

Coverage gate: **80% line coverage** (enforced in CI).

---

## 7. Verify the Service

### Login with a registered user

First, register a user via the User Service (if not already done):

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"MySecurePass123"}'
```

Then log in via the Auth Service:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"MySecurePass123"}'
```

Expected response:

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "a3f9c2d1-7e4b-4a8f-b1c6-2d3e4f5a6b7c",
  "expiresIn": 900,
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "email": "jane@example.com"
  }
}
```

### Verify an access token

```bash
curl -X POST http://localhost:3001/auth/verify \
  -H "Authorization: Bearer <accessToken>"
```

### Refresh the access token

```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

### Logout

```bash
curl -X POST http://localhost:3001/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

Expected: HTTP 204, empty body.

---

## 8. Docker Build (Single Service)

```bash
cd services/auth-service
docker build -t auth-service:local .
```

---

## 9. Lint and Type-Check

```bash
npm run lint       # ESLint — zero warnings in CI
npm run typecheck  # tsc --noEmit
```

---

## Key Environment Variable Reference

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | No | `3001` | HTTP port |
| `JWT_SECRET` | **Yes** | — | ≥ 32 chars; must match all token-verifying services |
| `JWT_ACCESS_EXPIRES_IN` | No | `900` | Seconds |
| `JWT_REFRESH_EXPIRES_IN` | No | `604800` | Seconds (7 days) |
| `REDIS_URL` | No | `redis://localhost:6379` | |
| `USER_SERVICE_URL` | **Yes** | — | e.g. `http://user-service:3000` |
| `INTERNAL_API_KEY` | **Yes** | — | Must match User Service `INTERNAL_API_KEY` |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | |
| `RATE_LIMIT_MAX` | No | `10` | |

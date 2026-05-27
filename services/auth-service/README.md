# Auth Service

JWT-based authentication microservice. Issues access tokens, refresh tokens, and handles session revocation.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | Public | Exchange credentials for token pair |
| `POST` | `/auth/verify` | Bearer token | Validate an access token |
| `POST` | `/auth/refresh` | Body: refreshToken | Rotate refresh token and issue new access token |
| `POST` | `/auth/logout` | Body: refreshToken | Revoke refresh token (idempotent) |
| `GET` | `/health` | Public | Liveness check |

## Quick Start

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, INTERNAL_API_KEY, REDIS_URL, USER_SERVICE_URL
npm install
npm run dev
```

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions. Required variables:

- `JWT_SECRET` — HS256 signing key (≥ 32 chars)
- `INTERNAL_API_KEY` — shared secret for calling User Service internal endpoint (must match user-service)
- `REDIS_URL` — Redis connection string
- `USER_SERVICE_URL` — base URL of the User Service

## Development

```bash
npm test              # run tests
npm run test:coverage # run tests with coverage report
npm run lint          # lint
npm run typecheck     # TypeScript type check
npm run build         # compile to dist/
```

## Architecture

- **No database** — all state lives in Redis (refresh token store + rate-limit counters)
- **Token strategy**: short-lived access tokens (HS256 JWT) + opaque refresh tokens (UUID v4 in Redis)
- **Refresh rotation**: each use of a refresh token atomically issues a new one and revokes the old
- **Rate limiting**: Redis-backed sliding window on `POST /auth/login` (configurable via env)

## Running with Docker Compose

```bash
# From the project root — JWT_SECRET and INTERNAL_API_KEY must be set in the shell or .env
JWT_SECRET=<secret> INTERNAL_API_KEY=<key> docker compose up
```

See the project-level `docker-compose.yml` for the full service graph (auth-service, user-service, MongoDB, Redis).

# Implementation Plan: Authentication Service

**Branch**: `002-auth-service` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/002-auth-service/spec.md`

## Summary

Build an independently deployable Authentication Service responsible for the full session
lifecycle: credential verification, JWT access-token issuance, refresh-token management,
token verification, and logout. The service reads user credentials by calling the User
Service's internal REST endpoint (service-to-service) — it does NOT share the User Service
database. Refresh tokens are stored in Redis (per constitution); access tokens are
short-lived, self-contained JWTs verified stateless. Redis also serves the revocation
list and rate-limit counters. No MongoDB is required (YAGNI — all state fits in Redis).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js ≥ 20 LTS  
**Primary Dependencies**: Express 4.x, ioredis 5.x, jsonwebtoken 9.x, bcrypt 5.x (for constant-time compare only; hashing lives in User Service), zod 3.x, cors, express-rate-limit, uuid  
**Storage**: Redis only (refresh token store + revocation list + rate-limit counters). No MongoDB — the service owns no persistent business entities.  
**Testing**: Jest + ts-jest, Supertest, ioredis-mock  
**Target Platform**: Linux server (Docker container, Node.js LTS base image)  
**Project Type**: web-service (standalone RESTful microservice)  
**Performance Goals**: Login < 2 s p95; token verification < 50 ms p95 (stateless, no I/O); refresh < 100 ms p95  
**Constraints**: No direct DB access to User Service database; no cross-service code imports; all secrets via environment variables; 80% minimum test coverage in CI; short-lived access tokens (15 min default, configurable); long-lived refresh tokens (7 days default, configurable)  
**Scale/Scope**: 500 concurrent auth operations, 4 endpoints, single service

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Authentication-First | ✅ PASS | This service IS the authentication authority. `POST /auth/login` is the declared public endpoint. `POST /auth/refresh`, `POST /auth/logout`, and `POST /auth/verify` are internal/protected. Login endpoint is enumerated as public in the constitution. |
| II. Service Independence | ✅ PASS | Auth service owns its own Redis keyspace (`auth:*`). Credential verification is performed by calling `POST /api/internal/verify-credentials` on the User Service via REST — no shared database. No User Service code is imported. |
| III. Minimal Public Surface | ✅ PASS | One public endpoint: `POST /auth/login`. All other endpoints require either a valid refresh token (opaque, from cookie/body) or a valid access token. Documented in `contracts/auth.md`. |
| IV. Test-First | ✅ PASS (GATE) | Tests written before implementation. Jest + Supertest + ioredis-mock. CI enforces 80% coverage. |
| V. Simplicity & YAGNI | ✅ PASS | No MongoDB added — all auth state fits in Redis. No additional abstraction layers beyond constitution-mandated structure. Opaque refresh tokens (UUID) chosen over JWT refresh tokens to keep revocation simple. |
| Security: Token format | ✅ PASS | JWT, HS256, secret ≥ 256 bits from environment. Every token carries `exp` claim. |
| Security: Token validation | ✅ PASS | `POST /auth/verify` validates signature + expiry before returning any identity claim. |
| Security: Input validation | ✅ PASS | zod schemas on all endpoints. |
| Security: Error responses | ✅ PASS | Generic "invalid credentials" for all login failures (no field-level leakage). |
| Security: Rate limiting | ✅ PASS | `express-rate-limit` on `POST /auth/login`. |

**Post-Design Re-check**: ✅ All gates pass. Redis-only persistence does not violate constitution — the "each service owns its own MongoDB" rule applies when a service has business entities requiring persistence; this service's only owned state is ephemeral session data (ideal for Redis).

## Project Structure

### Documentation (this feature)

```text
specs/002-auth-service/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── auth.md          # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
services/
└── auth-service/
    ├── src/
    │   ├── config/
    │   │   ├── redis.ts        # ioredis client setup
    │   │   ├── env.ts          # Validated env vars via zod
    │   │   └── logger.ts       # Structured logger (pino or console-based)
    │   ├── middleware/
    │   │   ├── errorHandler.ts # Global Express error handler
    │   │   └── rateLimiter.ts  # express-rate-limit config for /auth/login
    │   ├── services/
    │   │   ├── token.service.ts    # JWT sign/verify; refresh token CRUD in Redis
    │   │   └── user-client.service.ts  # HTTP client that calls User Service verify-credentials
    │   ├── routes/
    │   │   └── auth.routes.ts  # Express router — thin handlers only
    │   ├── validators/
    │   │   └── auth.validators.ts  # zod schemas for login, refresh, logout payloads
    │   └── app.ts              # Express app bootstrap (no listen — testable)
    ├── server.ts               # Entry point — calls app.listen
    ├── tests/
    │   ├── contract/
    │   │   └── auth.contract.test.ts    # Endpoint contract tests (Supertest)
    │   ├── integration/
    │   │   └── auth.integration.test.ts # Full flow with ioredis-mock + mocked user-client
    │   └── unit/
    │       ├── token.service.test.ts
    │       └── auth.validators.test.ts
    ├── Dockerfile
    ├── .env.example
    ├── jest.config.ts
    ├── tsconfig.json
    ├── eslint.config.js
    ├── .prettierrc
    └── package.json
```

**Structure Decision**: Single-service layout under `services/auth-service/`. Mirrors the
`user-service` directory structure for consistency. No `models/` or `cache/` directories
(no Mongoose, no cache-aside pattern). A `user-client.service.ts` module isolates all
outbound HTTP calls to the User Service. All Redis interactions are encapsulated in
`token.service.ts`.

## Complexity Tracking

> No constitution violations requiring justification.

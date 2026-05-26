# Implementation Plan: Simple User Service

**Branch**: `001-user-service` | **Date**: 2026-05-26 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-user-service/spec.md`

## Summary

Build an independently deployable RESTful User Service that supports full user CRUD
(register, view profile, update profile, delete account). User registration is public;
all other operations require a valid JWT token issued by the Authentication Service.
A Redis cache-aside layer is used to serve repeated profile lookups without hitting
MongoDB on every request, satisfying SC-002 (< 1 s authenticated reads) and SC-005
(500 concurrent users without degradation). MongoDB is the system of record;
Redis holds short-lived copies keyed by user id.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js ≥ 20 LTS  
**Primary Dependencies**: Express 4.x, Mongoose 8.x, ioredis 5.x, jsonwebtoken 9.x, bcrypt 5.x, zod 3.x, cors, express-rate-limit  
**Storage**: MongoDB (primary persistence, one dedicated database for this service), Redis (cache-aside layer for profile reads)  
**Testing**: Jest + ts-jest, Supertest, mongodb-memory-server, ioredis-mock  
**Target Platform**: Linux server (Docker container, Node.js LTS base image)  
**Project Type**: web-service (standalone RESTful microservice)  
**Performance Goals**: < 200 ms p95 for cached profile reads; < 500 ms p95 for uncached reads; registration < 2 s  
**Constraints**: No cross-service database access; cache TTL configurable via env var (default 300 s); no hard-coded credentials; 80 % minimum test coverage in CI  
**Scale/Scope**: 500 concurrent users, 4 endpoints, single service

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Authentication-First | ✅ PASS | `POST /users` (registration) is the only public endpoint. `GET`, `PATCH`, `DELETE /users/:id` all require a valid, unexpired JWT validated in middleware before any handler logic runs. |
| II. Service Independence | ✅ PASS | Dedicated MongoDB database (`user-service-db`). No imports from Auth or Product services. Inter-service communication is token-based only (User Service reads the token; Auth Service issued it). |
| III. Minimal Public Surface | ✅ PASS | One public endpoint declared: `POST /api/users`. All others are protected. Documented in contracts/users.md. |
| IV. Test-First | ✅ PASS (GATE) | Tests are written before implementation code. Jest + Supertest + mongodb-memory-server + ioredis-mock. CI enforces 80 % coverage. |
| V. Simplicity & YAGNI | ⚠️ JUSTIFIED | Cache-aside layer adds complexity beyond a trivial CRUD service. Justified: SC-005 requires 500 concurrent users; repeated MongoDB round-trips under concurrent load would breach SC-002 (< 1 s reads). See Complexity Tracking below. |
| Security: Password hashing | ✅ PASS | bcrypt, cost factor 12. No plaintext stored or logged. |
| Security: Token validation | ✅ PASS | JWT signature + expiry verified in `authMiddleware` before handler runs. |
| Security: Input validation | ✅ PASS | zod schemas validate all request bodies and params at route level. |
| Security: Error responses | ✅ PASS | Custom error handler strips internal details; clients receive generic messages. |
| Security: Rate limiting | ✅ PASS | `express-rate-limit` on `POST /api/users` (public endpoint). |

**Post-Design Re-check**: ✅ All gates pass. Cache layer uses Redis as a read-through store (source of truth remains MongoDB); this does not violate the "not a primary data store" rule.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-service/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── users.md         # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
services/
└── user-service/
    ├── src/
    │   ├── config/
    │   │   ├── db.ts           # Mongoose connection setup
    │   │   ├── redis.ts        # ioredis client setup
    │   │   └── env.ts          # Validated env vars via zod
    │   ├── middleware/
    │   │   ├── auth.ts         # JWT verification middleware
    │   │   ├── errorHandler.ts # Global Express error handler
    │   │   └── rateLimiter.ts  # express-rate-limit config
    │   ├── models/
    │   │   └── user.model.ts   # Mongoose schema + TypeScript interface
    │   ├── cache/
    │   │   └── user.cache.ts   # Cache-aside helpers: get, set, invalidate
    │   ├── services/
    │   │   └── user.service.ts # Business logic (register, getById, update, delete)
    │   ├── routes/
    │   │   └── user.routes.ts  # Express router — thin handlers only
    │   ├── validators/
    │   │   └── user.validators.ts  # zod schemas for request payloads
    │   └── app.ts              # Express app bootstrap (no listen — testable)
    ├── tests/
    │   ├── contract/
    │   │   └── users.contract.test.ts   # Endpoint contract tests (Supertest)
    │   ├── integration/
    │   │   └── users.integration.test.ts # Full flow tests (mongo-memory-server)
    │   └── unit/
    │       ├── user.service.test.ts
    │       └── user.cache.test.ts
    ├── Dockerfile
    ├── .env.example
    ├── jest.config.ts
    ├── tsconfig.json
    ├── eslint.config.js
    ├── .prettierrc
    └── package.json
```

**Structure Decision**: Single-service layout under `services/user-service/`. Follows the
microservice-per-directory convention. Source is cleanly separated into config, middleware,
models, cache, services, routes, and validators. Tests mirror the source layer structure.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|--------------------------------------|
| Redis cache-aside layer (`src/cache/user.cache.ts`) | SC-005: 500 concurrent users; SC-002: < 1 s p95 for authenticated profile reads. Repeated MongoDB queries under high concurrency would exceed latency targets. | Direct MongoDB-only approach would satisfy functional requirements but would breach SC-002 and SC-005 under load. Cache is confined to a single module and does not affect business logic correctness. |

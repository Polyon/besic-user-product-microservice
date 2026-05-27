# Implementation Plan: Product CRUD Service

**Branch**: `003-product-crud-service` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-product-crud-service/spec.md`

## Summary

Build an independently deployable Product Service that exposes a fully authenticated
REST API for product lifecycle management (create, read, update, delete). Every endpoint
requires a valid JWT issued by the Auth Service — verified via shared HS256 secret in a
thin auth middleware layer. Products are persisted in a MongoDB database owned exclusively
by this service. Redis is used for rate-limiting counters only (no product caching in v1 —
YAGNI). The service mirrors the structural pattern established by `user-service` and
`auth-service`, ensuring architectural consistency across the project.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js ≥ 20 LTS  
**Primary Dependencies**: Express 4.x, Mongoose 8.x, ioredis 5.x, jsonwebtoken 9.x, zod 3.x, cors, express-rate-limit  
**Storage**: MongoDB (via Mongoose) for product persistence; Redis (rate-limit counters only — no product caching in v1)  
**Testing**: Jest + ts-jest, Supertest, mongodb-memory-server, ioredis-mock  
**Target Platform**: Linux server (Docker container, Node.js LTS base image)  
**Project Type**: web-service (standalone RESTful microservice)  
**Performance Goals**: List (≤ 10k products) < 1 s p95; single-product read < 100 ms p95; write operations (create/update/delete) < 500 ms p95  
**Constraints**: No direct DB access to User/Auth Service databases; no cross-service code imports; all secrets via environment variables; 80% minimum test coverage in CI; no product caching in v1  
**Scale/Scope**: 500 concurrent read requests, 5 authenticated endpoints, single service

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Authentication-First | ✅ PASS | ALL product endpoints require a valid JWT (per spec FR-001 and constitution). No public product operations. Token verified before any business logic executes. Explicitly declared in the constitution's "Protected operations" list: "Product Service: ALL operations". |
| II. Service Independence | ✅ PASS | Product Service owns its own MongoDB database (`product-service-db`). No shared DB with User Service or Auth Service. Auth token is verified via shared secret — no synchronous call to Auth Service per request (stateless JWT, as established in research/002). No internal code imports from other services. |
| III. Minimal Public Surface | ✅ PASS | Zero public endpoints. All five CRUD endpoints require authentication. Documented in `contracts/products.md`. |
| IV. Test-First | ✅ PASS (GATE) | Tests written before implementation. Jest + Supertest + mongodb-memory-server + ioredis-mock. CI enforces 80% coverage. |
| V. Simplicity & YAGNI | ✅ PASS | No product caching (Redis rate-limit only). No soft-delete. No role-based access control. No search/filtering beyond pagination. All deferred features documented in spec Assumptions. |
| Security: Token format | ✅ PASS | JWT HS256 with shared `JWT_SECRET` (≥ 256 bits from env). Expiry verified on every request. |
| Security: Token validation | ✅ PASS | Auth middleware validates signature + expiry before routing to any handler. |
| Security: Input validation | ✅ PASS | zod schemas on all endpoints (create body, update body, path params, query params for pagination). |
| Security: Error responses | ✅ PASS | No stack traces or internal DB errors exposed in API responses. Generic error messages returned. |
| Security: Rate limiting | ✅ PASS | `express-rate-limit` applied at the service level. |

**Post-Design Re-check**: ✅ All gates pass. MongoDB is the correct persistence choice for a service with business entities (Product). Redis for rate-limiting only is consistent with the constitution ("Redis MUST NOT be used as a primary data store for business entities").

## Project Structure

### Documentation (this feature)

```text
specs/003-product-crud-service/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── products.md      # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
services/
└── product-service/
    ├── src/
    │   ├── config/
    │   │   ├── db.ts           # Mongoose connection setup
    │   │   ├── redis.ts        # ioredis client (rate-limit counters)
    │   │   ├── env.ts          # Validated env vars via zod
    │   │   └── logger.ts       # Structured logger
    │   ├── middleware/
    │   │   ├── auth.middleware.ts   # JWT verification (shared HS256 secret)
    │   │   ├── errorHandler.ts     # Global Express error handler
    │   │   └── rateLimiter.ts      # express-rate-limit config
    │   ├── models/
    │   │   └── product.model.ts    # Mongoose schema + IProduct interface
    │   ├── services/
    │   │   └── product.service.ts  # Business logic: CRUD operations against MongoDB
    │   ├── routes/
    │   │   └── product.routes.ts   # Express router — thin handlers only
    │   ├── validators/
    │   │   └── product.validators.ts  # zod schemas: create, update, params, query
    │   └── app.ts                  # Express app bootstrap (no listen — testable)
    ├── server.ts                   # Entry point — calls app.listen
    ├── tests/
    │   ├── setup.ts                # Jest global setup (mongodb-memory-server lifecycle)
    │   ├── contract/
    │   │   └── product.contract.test.ts   # Endpoint contract tests (Supertest)
    │   ├── integration/
    │   │   └── product.integration.test.ts # Full flow with mongodb-memory-server
    │   └── unit/
    │       ├── product.service.test.ts
    │       └── product.validators.test.ts
    ├── Dockerfile
    ├── .env.example
    ├── jest.config.ts
    ├── tsconfig.json
    ├── tsconfig.test.json
    ├── eslint.config.js
    ├── .prettierrc
    └── package.json
```

**Structure Decision**: Single-service layout under `services/product-service/`. Mirrors the `user-service` directory structure for consistency — `models/` for Mongoose schemas, `services/` for business logic, `routes/` for thin Express handlers, `validators/` for zod schemas, `middleware/` for auth and error handling. A dedicated `auth.middleware.ts` encapsulates all JWT verification logic.

## Complexity Tracking

> No constitution violations requiring justification.
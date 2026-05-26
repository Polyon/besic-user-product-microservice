---
description: "Task list for Simple User Service implementation"
---

# Tasks: Simple User Service

**Input**: Design documents from `/specs/001-user-service/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/users.md ✅

**Tests**: Included — Constitution Principle IV (Test-First) is NON-NEGOTIABLE and
explicitly gated in plan.md. Tests are written **before** implementation per the
Red-Green-Refactor cycle.

**Organization**: Tasks are grouped by user story to enable independent implementation
and testing of each story increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependencies)
- **[Story]**: User story label (US1–US4 from spec.md)
- Exact file paths are shown for every task

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Scaffold the `services/user-service/` directory, install dependencies,
and configure all tooling. No business logic.

- [X] T001 Create project directory tree for `services/user-service/` per plan.md structure (src/config, src/middleware, src/models, src/cache, src/services, src/routes, src/validators, tests/contract, tests/integration, tests/unit)
- [X] T002 Initialize npm project and install all production dependencies in `services/user-service/package.json` (express, mongoose, ioredis, jsonwebtoken, bcrypt, zod, cors, express-rate-limit, pino, pino-http, dotenv) and dev dependencies (typescript, ts-node, @types/node, @types/express, @types/jsonwebtoken, @types/bcrypt, @types/cors, jest, ts-jest, @types/jest, supertest, @types/supertest, mongodb-memory-server, ioredis-mock, pino-pretty, eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, prettier)
- [X] T003 [P] Configure TypeScript strict mode in `services/user-service/tsconfig.json` (strict: true, target: ES2022, module: CommonJS, outDir: dist, rootDir: src)
- [X] T004 [P] Install and configure ESLint with @typescript-eslint in `services/user-service/eslint.config.js` and Prettier in `services/user-service/.prettierrc`
- [X] T005 [P] Install and configure Jest with ts-jest in `services/user-service/jest.config.ts` (testEnvironment: node, coverage threshold: 80%)
- [X] T006 [P] Create `services/user-service/.env.example` with all required env vars (PORT, MONGODB_URI, JWT_SECRET, REDIS_URL, CACHE_TTL_SECONDS, BCRYPT_COST, NODE_ENV, LOG_LEVEL, CORS_ORIGINS)
- [X] T007 [P] Create `services/user-service/Dockerfile` using node:20-alpine base, npm ci --omit=dev, EXPOSE 3001, CMD node dist/server.js
- [X] T008 [P] Create `docker-compose.yml` at repository root with service definitions for `user-service` (build: services/user-service, ports: "3001:3001", depends_on: mongodb + redis), `mongodb` (image: mongo:7, port 27017, named volume), and `redis` (image: redis:7-alpine, port 6379, named volume); add env_file reference to services/user-service/.env

**Checkpoint**: Project scaffolded and tooling configured — all linting and build commands run without errors.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story can be
implemented. No user story work can begin until this phase is complete.

**⚠️ CRITICAL**: Phases 3–6 depend on every task in this phase being complete.

- [X] T009 Implement zod-validated environment variable config in `services/user-service/src/config/env.ts` (parse and export PORT, MONGODB_URI, JWT_SECRET, REDIS_URL, CACHE_TTL_SECONDS, BCRYPT_COST, NODE_ENV, LOG_LEVEL; throw on missing required vars)
- [X] T010 [P] Implement Mongoose connection factory in `services/user-service/src/config/db.ts` (connect with MONGODB_URI from env, export connectDB function, log connection status via pino)
- [X] T011 [P] Implement ioredis client singleton in `services/user-service/src/config/redis.ts` (connect with REDIS_URL from env, export redis client instance, handle connection errors)
- [X] T012 [P] Write unit test for User model toJSON transform in `services/user-service/tests/unit/user.model.test.ts` (assert: passwordHash absent from toJSON output, _id renamed to id, __v absent, name and email present, createdAt and updatedAt present; use mongodb-memory-server) ⚠️ Write FIRST — must FAIL before T013
- [X] T013 Implement User Mongoose schema with toJSON transform in `services/user-service/src/models/user.model.ts` (fields: name, email, passwordHash, timestamps: true; toJSON: rename _id→id, remove passwordHash, remove __v; unique index on email; export IUser interface and UserModel)
- [X] T014 [P] Write unit test for errorHandler middleware in `services/user-service/tests/unit/errorHandler.test.ts` (assert: MongoDB error code 11000 → 409 with conflict message, AppError preserves status code and message, unknown error → 500 with generic message, no stack trace or internal detail in response body) ⚠️ Write FIRST — must FAIL before T015
- [X] T015 [P] Implement global Express error handler middleware in `services/user-service/src/middleware/errorHandler.ts` (catch AppError and unexpected errors, map MongoDB error code 11000→409, strip internal details from responses, return { error, details? })
- [X] T016 Bootstrap Express app without listen in `services/user-service/src/app.ts` (configure pino-http as **first** middleware — redact req.headers.authorization, pino-pretty transport in development / JSON in production, satisfies FR-010; attach JSON body parser; import and mount user router at /api/users; attach errorHandler as last middleware; export app for testing)

**Checkpoint**: Foundation complete — `npm run build` succeeds, T012 and T014 pass GREEN, app can be imported in tests.

---

## Phase 3: User Story 1 — User Registration (Priority: P1) 🎯 MVP

**Goal**: Any visitor can POST to `/api/users` with name, email, and password to create
an account. Returns the public user profile (no password). Rate-limited.

**Independent Test**: `POST /api/users` with valid payload → 201 with user object (no `passwordHash`). Duplicate email → 409. Missing field → 400. No auth token needed.

### Tests for User Story 1 ⚠️ Write FIRST — ensure they FAIL before implementing T019–T022

- [X] T017 [P] [US1] Write contract test for `POST /api/users` (201 success, 400 validation, 409 conflict, 429 rate-limit) in `services/user-service/tests/contract/users.contract.test.ts` using Supertest + mongodb-memory-server
- [X] T018 [P] [US1] Write unit test for `UserService.register` (hashes password, saves user, returns safe object without passwordHash, throws on duplicate) in `services/user-service/tests/unit/user.service.test.ts` using Jest mocks

### Implementation for User Story 1

- [X] T019 [P] [US1] Implement registration zod validator schema (`registerSchema`) in `services/user-service/src/validators/user.validators.ts` (name: string 1–100, email: z.string().email(), password: string min 8; use .strip() to drop unknown fields)
- [X] T020 [P] [US1] Implement express-rate-limit middleware for public endpoints in `services/user-service/src/middleware/rateLimiter.ts` (windowMs: 15 min, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests..." })
- [X] T021 [US1] Implement `UserService.register` in `services/user-service/src/services/user.service.ts` (validate via registerSchema, lowercase email, hash password with bcrypt cost BCRYPT_COST, create User document, return toJSON result — never return passwordHash)
- [X] T022 [US1] Implement `POST /api/users` route handler and mount router in `services/user-service/src/routes/user.routes.ts` (apply rateLimiter, call UserService.register, respond 201; mount at /api/users in app.ts)

**Checkpoint**: US1 complete — T017+T018 tests pass GREEN. `POST /api/users` independently functional.

---

## Phase 4: User Story 2 — View Own Profile (Priority: P2)

**Goal**: An authenticated user can `GET /api/users/:id` to retrieve their own profile.
Response is served from Redis cache on repeat calls; MongoDB queried only on cache miss.

**Independent Test**: `GET /api/users/:id` with valid JWT → 200 public user object (cache miss then cache hit on repeat). No token → 401. Wrong user id → 403.

### Tests for User Story 2 ⚠️ Write FIRST — ensure they FAIL before implementing T026–T029

- [X] T023 [P] [US2] Write contract test for `GET /api/users/:id` (200 cache miss, 200 cache hit, 401 no token, 401 expired token, 403 wrong user, 404 not found) in `services/user-service/tests/contract/users.contract.test.ts` using Supertest + ioredis-mock
- [X] T024 [P] [US2] Write unit test for cache helpers (get returns parsed object on hit, returns null on miss, set serialises to JSON with TTL, invalidate calls DEL) in `services/user-service/tests/unit/user.cache.test.ts` using ioredis-mock
- [X] T025 [P] [US2] Write unit test for JWT auth middleware in `services/user-service/tests/unit/auth.test.ts` (assert: missing Authorization header → 401, malformed token → 401, expired token → 401, tampered signature → 401, valid token → next() called with res.locals.user populated with userId and email) ⚠️ Write FIRST — must FAIL before T026

### Implementation for User Story 2

- [X] T026 [US2] Implement JWT auth middleware in `services/user-service/src/middleware/auth.ts` (extract Bearer token from Authorization header, call jwt.verify with JWT_SECRET, attach decoded payload to res.locals.user, return 401 on missing/invalid/expired token)
- [X] T027 [P] [US2] Implement Redis cache-aside helpers in `services/user-service/src/cache/user.cache.ts` (getUser(id): parse JSON from `user:{id}` key; setUser(id, user): JSON.stringify with EX CACHE_TTL_SECONDS; invalidateUser(id): DEL `user:{id}`)
- [X] T028 [US2] Implement `UserService.getById` with cache-aside in `services/user-service/src/services/user.service.ts` (check cache → hit: return parsed object; miss: query MongoDB, 404 if not found, write to cache, return result; enforce ownership: requestingUserId from res.locals.user.userId must equal id param, return 403 if not)
- [X] T029 [US2] Implement `GET /api/users/:id` route handler in `services/user-service/src/routes/user.routes.ts` (apply authMiddleware; validate `:id` is a valid MongoDB ObjectId via mongoose.Types.ObjectId.isValid — return 400 if not; call UserService.getById; respond 200)

**Checkpoint**: US2 complete — T023+T024+T025 tests pass GREEN. Cache-aside confirmed by test: repeat GET hits Redis, not MongoDB.

---

## Phase 5: User Story 3 — Update Own Profile (Priority: P3)

**Goal**: An authenticated user can `PATCH /api/users/:id` to update name, email, and/or
password. Cache is invalidated after every successful update.

**Independent Test**: `PATCH /api/users/:id` with valid JWT and at least one field → 200 updated user. Empty body → 400. Duplicate email → 409. No token → 401. Redis `user:{id}` key deleted after update.

### Tests for User Story 3 ⚠️ Write FIRST — ensure they FAIL before implementing T032–T034

- [X] T030 [P] [US3] Write contract test for `PATCH /api/users/:id` (200 name update, 200 password update, 400 empty body, 401 no token, 403 wrong user, 409 duplicate email, verify cache invalidated) in `services/user-service/tests/contract/users.contract.test.ts`
- [X] T031 [P] [US3] Write unit test for `UserService.update` (updates fields, re-hashes password when provided, calls invalidateUser, throws on duplicate email, throws 404 if not found) in `services/user-service/tests/unit/user.service.test.ts`

### Implementation for User Story 3

- [X] T032 [P] [US3] Add `updateSchema` to `services/user-service/src/validators/user.validators.ts` (all fields optional: name?, email?, password?; add .refine to reject empty objects with "At least one field must be provided")
- [X] T033 [US3] Implement `UserService.update` in `services/user-service/src/services/user.service.ts` (validate via updateSchema, enforce ownership, lowercase email if changed, re-hash password if changed with bcrypt, findByIdAndUpdate with {new: true, runValidators: true}, call invalidateUser, return safe toJSON result)
- [X] T034 [US3] Implement `PATCH /api/users/:id` route handler in `services/user-service/src/routes/user.routes.ts` (apply authMiddleware; validate `:id` is a valid MongoDB ObjectId via mongoose.Types.ObjectId.isValid — return 400 if not; call UserService.update; respond 200)

**Checkpoint**: US3 complete — T030+T031 tests pass GREEN. Profile fields updatable; cache cleared on each write.

---

## Phase 6: User Story 4 — Delete Own Account (Priority: P4)

**Goal**: An authenticated user can `DELETE /api/users/:id` to permanently remove their
account. Cache entry is deleted on success.

**Independent Test**: `DELETE /api/users/:id` with valid JWT → 200 confirmation message. Subsequent `GET /api/users/:id` → 404. No token → 401. Redis `user:{id}` key deleted.

### Tests for User Story 4 ⚠️ Write FIRST — ensure they FAIL before implementing T037–T038

- [X] T035 [P] [US4] Write contract test for `DELETE /api/users/:id` (200 success + confirm message, 401 no token, 403 wrong user, 404 not found, verify subsequent GET returns 404, verify cache invalidated) in `services/user-service/tests/contract/users.contract.test.ts`
- [X] T036 [P] [US4] Write unit test for `UserService.delete` (calls findByIdAndDelete, calls invalidateUser, throws 404 if user not found, enforces ownership) in `services/user-service/tests/unit/user.service.test.ts`

### Implementation for User Story 4

- [X] T037 [US4] Implement `UserService.delete` in `services/user-service/src/services/user.service.ts` (enforce ownership, findByIdAndDelete, 404 if not found, call invalidateUser, return void)
- [X] T038 [US4] Implement `DELETE /api/users/:id` route handler in `services/user-service/src/routes/user.routes.ts` (apply authMiddleware; validate `:id` is a valid MongoDB ObjectId via mongoose.Types.ObjectId.isValid — return 400 if not; call UserService.delete; respond 200 with { message: "Account deleted successfully" })

**Checkpoint**: US4 complete — T035+T036 tests pass GREEN. All 4 user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: CORS, full lifecycle integration test, production entry point, and CI
coverage gate. No new business logic. (Structured logging is already active from T016.)

- [ ] T039 [P] Add cors middleware in `services/user-service/src/app.ts` (import CORS_ORIGINS from env config, pass as origin array to cors(); no wildcard `*` in non-development environments; apply before route middleware)
- [ ] T040 Write integration test covering full user lifecycle in `services/user-service/tests/integration/users.integration.test.ts` (register → sign a test JWT directly using JWT_SECRET — no running Auth Service required → GET profile (cache miss) → GET profile again (cache hit) → PATCH name → verify GET returns updated name → DELETE → verify GET returns 404; uses mongodb-memory-server + ioredis-mock)
- [ ] T041 Create production server entry point in `services/user-service/src/server.ts` (import app, call connectDB, then app.listen on PORT; this file is NOT imported in tests — keeps app.ts testable)
- [ ] T042 Verify test coverage gate passes 80% minimum in `services/user-service/` by running `npm run test:coverage` and confirming all thresholds met; fix any gaps before merge

**Checkpoint**: All 42 tasks complete — service is production-ready, fully tested, and observable.

---

## Dependency Graph (User Story Completion Order)

```
Phase 1 (Setup)
    └─► Phase 2 (Foundational)
            └─► Phase 3 (US1 — Registration)  ← MVP: can ship independently
                    └─► Phase 4 (US2 — View Profile)
                            └─► Phase 5 (US3 — Update Profile)
                                    └─► Phase 6 (US4 — Delete Account)
                                            └─► Phase 7 (Polish)
```

US3 depends on US2 (shares authMiddleware and cache layer).
US4 depends on US2 (shares authMiddleware and cache layer).
US2 is the gate for US3 and US4.

---

## Parallel Execution Examples (per story)

**Phase 1** — T003, T004, T005, T006, T007, T008 can all run in parallel after T001+T002.  
**Phase 2** — T010 and T011 can run in parallel after T009; T012 and T014 (tests) can run in parallel after T011; T013 follows T012; T015 follows T014; T016 follows T015.  
**Phase 3 (US1)** — T017 and T018 (tests) can run in parallel; T019 and T020 (impl setup) can run in parallel; T021 must follow T019.  
**Phase 4 (US2)** — T023, T024, and T025 (tests) can all run in parallel; T026 and T027 can run in parallel after tests; T028 must follow T026+T027.  
**Phase 5 (US3)** — T030 and T031 (tests) can run in parallel; T032 can run in parallel with other impl; T033 must follow T032.  
**Phase 6 (US4)** — T035 and T036 (tests) can run in parallel; T037 must follow auth middleware.  
**Phase 7** — T039 can run in parallel with T040.

---

## Implementation Strategy

**MVP scope (Phase 1 + 2 + 3 only)**: After completing T001–T022, the service is a
fully functional registration endpoint — independently deployable and demonstrable.

**Incremental delivery**:
1. Ship US1 (registration only) — no auth required, minimal dependencies.
2. Add US2 (view profile + cache layer) — unlocks the Redis caching requirement.
3. Add US3 (update profile) — completes the write+invalidate cache cycle.
4. Add US4 (delete account) — completes all CRUD operations.
5. Polish phase — CORS configuration and full coverage gate.

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 42 |
| Phase 1 — Setup | 8 |
| Phase 2 — Foundational | 8 |
| Phase 3 — US1 Registration (P1) | 6 (2 tests + 4 impl) |
| Phase 4 — US2 View Profile (P2) | 7 (3 tests + 4 impl) |
| Phase 5 — US3 Update Profile (P3) | 5 (2 tests + 3 impl) |
| Phase 6 — US4 Delete Account (P4) | 4 (2 tests + 2 impl) |
| Phase 7 — Polish | 4 |
| Parallelizable tasks [P] | 25 |

**Independent test criteria per story**:

| Story | Pass Condition |
|-------|---------------|
| US1 (P1) | `POST /api/users` → 201 with public user object, no passwordHash; 409 on duplicate; 400 on invalid input |
| US2 (P2) | `GET /api/users/:id` → 200 (cache miss + hit); 401 without token; 403 for wrong user |
| US3 (P3) | `PATCH /api/users/:id` → 200 updated fields; cache key deleted; 409 on duplicate email |
| US4 (P4) | `DELETE /api/users/:id` → 200; subsequent GET → 404; cache key deleted |

**Suggested MVP**: US1 only (T001–T022) — delivers registration endpoint, zero auth dependency.

---

## Analysis Findings Applied

The following issues from the `speckit.analyze` report were addressed in this revision:

| Finding | Severity | Change Applied |
|---------|----------|----------------|
| C1 — No unit test for `user.model.ts` toJSON transform | CRITICAL | Added T012: unit test for model toJSON (test-first before T013) |
| C2 — No unit test for `auth.ts` middleware | CRITICAL | Added T025: unit test for auth middleware (test-first before T026) |
| C3 — No task for `docker-compose.yml` at repo root | CRITICAL | Added T008: create docker-compose.yml |
| E1 — No unit test for `errorHandler.ts` | MEDIUM | Added T014: unit test for errorHandler (test-first before T015) |
| U1 — `CORS_ORIGINS` missing from `.env.example` | MEDIUM | Updated T006: added CORS_ORIGINS to env vars list |
| U2 — No ObjectId validation on `:id` route param | MEDIUM | Updated T029, T034, T038: added ObjectId validation before service call |
| U3 — `LOG_LEVEL` missing from env.ts task description | MEDIUM | Updated T009: added LOG_LEVEL to parsed env vars list |
| L2 — Logging deferred to Phase 7; FR-010 unsatisfied during all story phases | LOW | Moved logging configuration into T016 (app.ts bootstrap, Phase 2) |

**Remaining findings for other artifacts** (not tasks.md — fix separately):

- **I1** (HIGH): `spec.md` FR-007 uses "UPDATE" instead of "PATCH" — fix in [specs/001-user-service/spec.md](spec.md)
- **I2** (HIGH): `plan.md` Post-Design Re-check says "read-through store" instead of "cache-aside store" — fix in [specs/001-user-service/plan.md](plan.md)
- **B1** (MEDIUM): SC-001/SC-002 "normal operating load" is undefined — add a parenthetical baseline (e.g. "under 50 concurrent requests") in [specs/001-user-service/spec.md](spec.md)
- **B2** (MEDIUM): SC-005 "measurable degradation" has no numeric threshold — specify p95 latency at 500 concurrent users in [specs/001-user-service/spec.md](spec.md)
- **L1** (LOW): US2 Independent Test implies a running Auth Service — clarify to use a test-signed JWT in [specs/001-user-service/spec.md](spec.md)

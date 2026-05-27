---

description: "Task list for Authentication Service implementation"
---

# Tasks: Authentication Service

**Input**: Design documents from `/specs/002-auth-service/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/auth.md ✅ | quickstart.md ✅

**Organization**: Tasks grouped by user story to enable independent implementation and testing.  
**Tests**: Constitution Principle IV (Test-First) is NON-NEGOTIABLE — test tasks are included in every story phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: User story label — US1 / US2 / US3 / US4
- Paths are relative to `services/auth-service/`

---

## Phase 1: Setup

**Purpose**: Create the `auth-service` project skeleton, tooling config, and Docker infrastructure. No business logic — just a bootable Express app and wired config.

- [x] T001 Initialise `services/auth-service/` Node.js project: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.js`, `.prettierrc`
- [x] T002 [P] Install runtime dependencies in `services/auth-service/package.json`: express, ioredis, jsonwebtoken, bcrypt, zod, cors, express-rate-limit, uuid, rate-limit-redis
- [x] T003 [P] Install dev dependencies in `services/auth-service/package.json`: typescript, ts-jest, jest, @types/*, supertest, ioredis-mock
- [x] T004 [P] Create `services/auth-service/jest.config.ts` with ts-jest transformer and 80% coverage threshold
- [x] T005 Create `services/auth-service/src/app.ts` — bare Express app bootstrap (no `listen`; testable)
- [x] T006 Create `services/auth-service/server.ts` — entry point that imports app and calls `app.listen` (at service root, not under `src/`, per plan.md project structure)
- [x] T007 Create `services/auth-service/Dockerfile` using Node LTS base image (mirrors user-service pattern)
- [x] T008 [P] Add `auth-service` block to root `docker-compose.yml` (port 3001, depends_on redis and user-service)

**Checkpoint**: `npm run build` succeeds; `npm test` runs (zero tests, zero failures); Docker image builds cleanly.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user story implementations depend on. Must be fully complete before Phase 3 begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T009 Create `services/auth-service/src/config/env.ts` — zod schema validating all required env vars (`PORT`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `REDIS_URL`, `USER_SERVICE_URL`, `INTERNAL_API_KEY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `NODE_ENV`)
- [x] T010 [P] Create `services/auth-service/src/config/redis.ts` — ioredis client factory (singleton, reads `REDIS_URL` from env)
- [x] T011 [P] Create `services/auth-service/src/config/logger.ts` — structured logger (pino or console-based); redacts tokens and secrets from output
- [x] T012 Create `services/auth-service/src/middleware/errorHandler.ts` — global Express error handler; maps known error types to HTTP status codes; never exposes stack traces in non-development environments
- [x] T013 [P] Create `services/auth-service/src/middleware/rateLimiter.ts` — `express-rate-limit` middleware using `rate-limit-redis` store; reads window/max from env; applies only to `POST /auth/login`
- [x] T014 Create `services/auth-service/src/validators/auth.validators.ts` — zod schemas for: LoginRequest, RefreshRequest, LogoutRequest
- [x] T015 Create `services/auth-service/src/services/token.service.ts` — JWT sign/verify helpers + Redis refresh token CRUD (`storeRefreshToken`, `getRefreshToken`, `deleteRefreshToken`); imports redis client and env config
- [x] T016 Create `services/auth-service/src/services/user-client.service.ts` — HTTP client wrapping `POST /api/internal/verify-credentials` on User Service; sends `X-Internal-Api-Key` header; returns typed result or throws `InvalidCredentialsError`
- [x] T017 Create `services/auth-service/src/routes/auth.routes.ts` — Express router with placeholder handlers for all 4 routes; import validators and middleware
- [x] T018 Wire router, errorHandler, cors, and rateLimiter into `services/auth-service/src/app.ts`

**Checkpoint**: Service starts without error; all 4 routes return 501 Not Implemented; Redis client connects; env validation rejects missing vars at startup.

---

## Phase 3: User Story 1 — User Login (Priority: P1) 🎯 MVP

**Goal**: A registered user can submit email + password and receive a signed access token and refresh token.

**Independent Test**: Start the auth-service with a running User Service (or mocked `verify-credentials` endpoint). `POST /auth/login` with valid credentials returns `{ accessToken, refreshToken, expiresIn, user }`. Invalid credentials return HTTP 401 with a generic message. Rate-limiting triggers after 10 failed attempts.

### Tests for User Story 1 (Constitution IV — Test-First, write before implementation)

- [ ] T019 [P] [US1] Write contract tests for `POST /auth/login` in `services/auth-service/tests/contract/auth.contract.test.ts`: valid credentials → 200 + token shape; invalid password → 401 generic; non-existent email → 401 generic; missing fields → 400 validation error
- [ ] T020 [P] [US1] Write unit tests for `token.service.ts` login path in `services/auth-service/tests/unit/token.service.test.ts`: `signAccessToken` produces verifiable JWT; `storeRefreshToken` sets Redis key with correct TTL; tokens contain expected claims (`sub`, `email`, `exp`)
- [ ] T021 [P] [US1] Write integration test for full login flow in `services/auth-service/tests/integration/auth.integration.test.ts`: mock `user-client.service`, use ioredis-mock; assert token pair returned and refresh key exists in Redis

### Implementation for User Story 1

- [ ] T022 [US1] Implement `signAccessToken(userId, email)` in `services/auth-service/src/services/token.service.ts` — signs JWT with HS256 using `JWT_SECRET`; payload: `{ sub, email, iat, exp }`
- [ ] T023 [US1] Implement `storeRefreshToken(userId, email)` in `services/auth-service/src/services/token.service.ts` — generates UUID v4; sets `auth:refresh:{uuid}` in Redis with TTL from `JWT_REFRESH_EXPIRES_IN`; returns the token string
- [ ] T024 [US1] Implement `verifyCredentials(email, password)` in `services/auth-service/src/services/user-client.service.ts` — POST to User Service internal endpoint; returns `{ id, email }` on 200; throws `InvalidCredentialsError` on 401; throws `ServiceUnavailableError` on network/5xx
- [ ] T025 [US1] Implement `POST /auth/login` handler in `services/auth-service/src/routes/auth.routes.ts` — validate body with `LoginRequestSchema`; call `user-client.service.verifyCredentials`; call `token.service.signAccessToken` + `storeRefreshToken`; return 200 with token pair; map errors to generic 401 or 503; log login event (success/failure, no password)
- [ ] T026 [US1] Verify rate-limiter middleware is applied to `POST /auth/login` route only in `services/auth-service/src/app.ts`

**Checkpoint**: All Phase 3 tests pass. `POST /auth/login` is fully functional. MVP delivered.

---

## Phase 4: User Story 2 — Token Verification (Priority: P2)

**Goal**: Any caller can submit a bearer access token and receive the encoded user identity, or a clear rejection code if the token is invalid or expired.

**Independent Test**: After logging in (Phase 3), call `POST /auth/verify` with the access token. Returns `{ userId, email, expiresAt }`. Call with an expired token returns HTTP 401 `token_expired`. Call with a tampered token returns HTTP 401 `invalid_token`.

### Tests for User Story 2 (Test-First)

- [ ] T027 [P] [US2] Write contract tests for `POST /auth/verify` in `services/auth-service/tests/contract/auth.contract.test.ts`: valid token → 200 + identity; no token → 401 unauthorized; expired token → 401 token_expired; tampered token → 401 invalid_token
- [ ] T028 [P] [US2] Write unit tests for `token.service.ts` verify path in `services/auth-service/tests/unit/token.service.test.ts`: `verifyAccessToken` returns payload for valid token; throws `TokenExpiredError` for expired; throws `InvalidTokenError` for tampered

### Implementation for User Story 2

- [ ] T029 [US2] Implement `verifyAccessToken(token)` in `services/auth-service/src/services/token.service.ts` — calls `jwt.verify`; maps `JsonWebTokenError` → `InvalidTokenError`; maps `TokenExpiredError` → `TokenExpiredError`; returns `AccessTokenPayload`
- [ ] T030 [US2] Implement `POST /auth/verify` handler in `services/auth-service/src/routes/auth.routes.ts` — extract `Authorization: Bearer <token>` header; call `token.service.verifyAccessToken`; return 200 `{ userId, email, expiresAt }` on success; map errors to correct 401 error codes per contract

**Checkpoint**: All Phase 4 tests pass. Token verification is fully functional. User Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 — Access Token Refresh (Priority: P3)

**Goal**: A caller with a valid refresh token can obtain a new access token (and rotated refresh token) without re-entering credentials.

**Independent Test**: After login, call `POST /auth/refresh` with the refresh token. Returns a new `{ accessToken, refreshToken, expiresIn }`. The old refresh token is no longer usable. An expired/revoked refresh token returns HTTP 401.

### Tests for User Story 3 (Test-First)

- [ ] T031 [P] [US3] Write contract tests for `POST /auth/refresh` in `services/auth-service/tests/contract/auth.contract.test.ts`: valid refresh token → 200 + new token pair; old token rejected after rotation → 401; expired/unknown token → 401 invalid_refresh_token; missing body field → 400
- [ ] T032 [P] [US3] Write unit tests for refresh token rotation in `services/auth-service/tests/unit/token.service.test.ts`: `rotateRefreshToken` deletes old Redis key; stores new UUID; returns new token; replay of old token returns null from Redis

### Implementation for User Story 3

- [ ] T033 [US3] Implement `getRefreshToken(token)` in `services/auth-service/src/services/token.service.ts` — GET `auth:refresh:{token}` from Redis; parse JSON; return `RefreshTokenPayload` or `null`
- [ ] T034 [US3] Implement `rotateRefreshToken(oldToken, userId, email)` in `services/auth-service/src/services/token.service.ts` — delete old Redis key; store new UUID refresh token; return new token string (atomic: use Redis pipeline)
- [ ] T035 [US3] Implement `POST /auth/refresh` handler in `services/auth-service/src/routes/auth.routes.ts` — validate body with `RefreshRequestSchema`; call `token.service.getRefreshToken`; reject with 401 if null (expired/revoked/replay); call `rotateRefreshToken` + `signAccessToken`; return 200 with new token pair

**Checkpoint**: All Phase 5 tests pass. Token refresh with rotation is fully functional.

---

## Phase 6: User Story 4 — Logout (Priority: P4)

**Goal**: A caller can revoke their refresh token. Subsequent use of that token returns 401. The operation is idempotent.

**Independent Test**: After login, call `POST /auth/logout` with the refresh token. Returns HTTP 204. Immediately call `POST /auth/refresh` with the same token — returns HTTP 401. Call logout again with the same (now-invalid) token — still returns HTTP 204.

### Tests for User Story 4 (Test-First)

- [ ] T036 [P] [US4] Write contract tests for `POST /auth/logout` in `services/auth-service/tests/contract/auth.contract.test.ts`: valid refresh token → 204; already-revoked token → 204 (idempotent); missing body field → 400; confirm subsequent refresh returns 401
- [ ] T037 [P] [US4] Write unit tests for `deleteRefreshToken` in `services/auth-service/tests/unit/token.service.test.ts`: key deleted from Redis; subsequent GET returns null; missing key (already deleted) does not throw

### Implementation for User Story 4

- [ ] T038 [US4] Implement `deleteRefreshToken(token)` in `services/auth-service/src/services/token.service.ts` — DEL `auth:refresh:{token}` from Redis; does not throw if key does not exist
- [ ] T039 [US4] Implement `POST /auth/logout` handler in `services/auth-service/src/routes/auth.routes.ts` — validate body with `LogoutRequestSchema`; call `token.service.deleteRefreshToken`; always return 204 (idempotent — no distinction between valid and already-revoked)

**Checkpoint**: All Phase 6 tests pass. Full session lifecycle (login → verify → refresh → logout) is functional end-to-end.

---

## Phase 7: User Service — Internal Credential Endpoint (Cross-Service Dependency)

**Purpose**: Add the `POST /api/internal/verify-credentials` endpoint to the User Service. This is required for the Auth Service login flow (US1) to work end-to-end in integration.

**⚠️ Note**: These tasks modify `services/user-service/`. Coordinate with the user-service branch or implement here on `002-auth-service` as an additive change.

- [ ] T040 [P] Write unit tests for `verifyCredentials` in `services/user-service/tests/unit/user.service.test.ts`: correct credentials → `{ id, email }`; wrong password → throws; unknown email → throws (same error type)
- [ ] T041 [P] Write contract tests for `POST /api/internal/verify-credentials` in `services/user-service/tests/contract/users.contract.test.ts`: valid key + correct credentials → 200; valid key + wrong credentials → 401; missing API key → 401; missing fields → 400
- [ ] T042 Implement `verifyCredentials(email, password)` method in `services/user-service/src/services/user.service.ts` — look up user by email; use `bcrypt.compare` for constant-time password check; return `{ id, email }` on success; throw `InvalidCredentialsError` on failure
- [ ] T043 Create `services/user-service/src/middleware/internalApiKey.ts` — middleware that reads `X-Internal-Api-Key` header and compares with `INTERNAL_API_KEY` env var using `timingSafeEqual`; returns 401 if missing or invalid
- [ ] T044 Add `POST /api/internal/verify-credentials` route in `services/user-service/src/routes/user.routes.ts` — protected by `internalApiKey` middleware; validate body; call `user.service.verifyCredentials`; return 200 `{ id, email }` on success or 401 generic on failure
- [ ] T045 Add `INTERNAL_API_KEY` to `services/user-service/src/config/env.ts` zod schema and `.env.example`

**Checkpoint**: User Service internal endpoint passes all tests. Auth Service can call it successfully in integration tests.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end wiring, security hardening, observability, and CI configuration.

- [ ] T046 [P] Add structured logging for all auth events in `services/auth-service/src/routes/auth.routes.ts`: login success (userId, timestamp), login failure (reason, no credentials), logout (userId), refresh (userId) — no sensitive values logged
- [ ] T047 [P] Validate that `cors` middleware in `services/auth-service/src/app.ts` does not use wildcard `*` in non-development environments (reads `NODE_ENV`)
- [ ] T048 [P] Create `services/auth-service/.env.example` with all required variables and placeholder values (no real secrets) — covers: `PORT`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `REDIS_URL`, `USER_SERVICE_URL`, `INTERNAL_API_KEY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `NODE_ENV`
- [ ] T049 [P] Write integration test in `services/auth-service/tests/integration/auth.integration.test.ts` covering full login → verify → refresh → logout cycle using ioredis-mock and mocked user-client
- [ ] T050 [P] Verify 80% line coverage gate is met across all source files; add/expand tests for any uncovered branches
- [ ] T051 Run `npm run lint` and `npm run typecheck` in `services/auth-service/`; resolve all ESLint warnings and TypeScript errors
- [ ] T052 [P] Update root `docker-compose.yml` to pass `JWT_SECRET` and `INTERNAL_API_KEY` as shared environment variables to both `auth-service` and `user-service`
- [ ] T053 [P] Update `services/auth-service/README.md` (or confirm quickstart.md in specs is sufficient for the project)
- [ ] T054 [P] Write performance test for `POST /auth/login` in `services/auth-service/tests/performance/login.perf.test.ts` using autocannon or k6: fire 50 sequential requests and assert p95 response time ≤ 2000 ms (SC-001); requires running User Service mock or real instance
- [ ] T055 [P] Write performance test for `POST /auth/verify` in `services/auth-service/tests/performance/verify.perf.test.ts`: fire 200 sequential requests with a valid token and assert p95 latency ≤ 50 ms (SC-002); runs against the in-process Supertest server (no Redis I/O — stateless path)
- [ ] T056 [P] Write concurrency load test in `services/auth-service/tests/performance/load.perf.test.ts`: simulate 500 concurrent login requests using autocannon `connections: 500`; assert all responses complete with HTTP 200 or 429 and p95 latency ≤ 2000 ms (SC-005)

**Checkpoint**: `npm test -- --coverage` passes with ≥ 80% coverage. `docker compose up` starts all services without error. All 4 auth endpoints respond correctly end-to-end. Performance tests (T054–T056) pass SC-001, SC-002, and SC-005 thresholds.

---

## Dependencies

```
Phase 1 (Setup)
  └─► Phase 2 (Foundation)
        └─► Phase 3 (US1: Login)          ← MVP — ship independently
              └─► Phase 4 (US2: Verify)   ← depends on token.service from US1
                    └─► Phase 5 (US3: Refresh) ← extends token.service
                          └─► Phase 6 (US4: Logout) ← adds delete to token.service

Phase 7 (User Service internal endpoint)  ← parallel to Phases 3-6; required for
                                             end-to-end integration tests

Phase 8 (Polish)  ← final, after all stories complete
```

**Cross-phase parallel opportunities**:
- Phase 7 tasks (T040–T045) can be worked in parallel with Phase 3–6 development
- Within each phase: tasks marked `[P]` can run in parallel (different files)
- Test tasks within each story phase can be written in parallel with each other

---

## Parallel Execution Examples

### Sprint 1 (MVP — Phase 1 + 2 + 3)

| Track A | Track B | Track C |
|---------|---------|---------|
| T001 → T005 → T006 | T002 → T003 → T004 | T007 → T008 |
| T009 → T015 → T016 | T010 → T013 → T014 | T011 → T012 |
| T017 → T018 | | |
| T019 → T022 → T025 | T020 → T023 → T024 | T021 (integration test) |
| T026 | | |

### Sprint 2 (US2 + US3 + US4 + User Service endpoint)

| Track A | Track B |
|---------|---------|
| T027 → T029 → T030 | T040 → T042 → T044 |
| T031 → T033 → T035 | T041 → T043 → T045 |
| T036 → T038 → T039 | T032 → T034 → T037 |

### Sprint 3 (Polish)

T046, T047, T048, T049, T050, T054, T055, T056 — all parallel  
T051 → T052 → T053 — sequential gate

---

## Implementation Strategy

**MVP Scope** (Phase 1 + 2 + 3 only — User Story 1):
- Bootable auth-service that can log a user in and return tokens
- Requires User Service internal endpoint (Phase 7) for end-to-end testing
- All other stories enhance the session lifecycle but do not block the MVP

**Incremental delivery order**:
1. **Phase 1–2**: Infrastructure skeleton (no features yet)
2. **Phase 3 + Phase 7**: Login works end-to-end (MVP)
3. **Phase 4**: Token verification (enables all downstream protected endpoints)
4. **Phase 5**: Token refresh (seamless sessions)
5. **Phase 6**: Logout (session revocation)
6. **Phase 8**: Polish and coverage gate

**Test-first discipline** (Constitution IV):
- Every implementation task in a story phase has a corresponding test task that precedes it
- Tests MUST be written and confirmed failing before implementation code is written
- No story is considered complete until its tests pass and coverage ≥ 80%

---

## Summary

| Phase | Tasks | Story | Parallel? |
|-------|-------|-------|-----------|
| Phase 1: Setup | T001–T008 | — | T002, T003, T004, T007, T008 |
| Phase 2: Foundation | T009–T018 | — | T010, T011, T013, T014 |
| Phase 3: Login | T019–T026 | US1 | T019, T020, T021 |
| Phase 4: Verify | T027–T030 | US2 | T027, T028 |
| Phase 5: Refresh | T031–T035 | US3 | T031, T032 |
| Phase 6: Logout | T036–T039 | US4 | T036, T037 |
| Phase 7: User Service | T040–T045 | (cross-service) | T040, T041 |
| Phase 8: Polish | T046–T056 | — | T046–T050, T052–T056 |
| **Total** | **56 tasks** | **4 stories** | |

**Format validation**: All 56 tasks follow `- [ ] T### [P?] [Story?] Description with file path`. ✅

---

## Analysis Fixes Applied

| Finding | Severity | Change Made |
|---------|----------|-------------|
| I1 — server.ts path mismatch | HIGH | T006 corrected from `src/server.ts` to `server.ts` (service root, per plan.md) |
| D1 — .env.example duplication | LOW | Removed `.env.example` from T001 scope; T048 is sole owner with full variable list |
| U1 — SC-001 (Login < 2s) untested | MEDIUM | Added T054: login p95 performance test |
| U2 — SC-002 (Verify < 50ms) untested | MEDIUM | Added T055: verify p95 latency test |
| U3 — SC-005 (500 concurrent) untested | MEDIUM | Added T056: 500-connection load test |

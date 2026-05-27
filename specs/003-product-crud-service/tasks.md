---

description: "Task list for Product CRUD Service implementation"
---

# Tasks: Product CRUD Service

**Input**: Design documents from `/specs/003-product-crud-service/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/products.md ✅ | quickstart.md ✅

**Organization**: Tasks grouped by user story to enable independent implementation and testing.  
**Tests**: Constitution Principle IV (Test-First) is NON-NEGOTIABLE — test tasks are included in every story phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: User story label — US1 / US2 / US3 / US4
- Paths are relative to `services/product-service/`

---

## Phase 1: Setup

**Purpose**: Create the `product-service` project skeleton, tooling config, and Docker infrastructure. No business logic — just a bootable Express app and wired config.

- [x] T001 Initialise `services/product-service/` Node.js project: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.js`, `.prettierrc`
- [x] T002 [P] Install runtime dependencies in `services/product-service/package.json`: express, mongoose, ioredis, jsonwebtoken, zod, cors, express-rate-limit, rate-limit-redis, dotenv
- [x] T003 [P] Install dev dependencies in `services/product-service/package.json`: typescript, ts-jest, jest, @types/*, supertest, mongodb-memory-server, ioredis-mock
- [x] T004 [P] Create `services/product-service/jest.config.ts` with ts-jest transformer, `globalSetup`/`globalTeardown` pointing to `tests/setup.ts`, and 80% coverage threshold
- [x] T005 Create `services/product-service/src/app.ts` — bare Express app bootstrap (no `listen`; testable)
- [x] T006 Create `services/product-service/server.ts` — entry point that imports app and calls `app.listen` (at service root, not under `src/`, per plan.md project structure)
- [x] T007 Create `services/product-service/Dockerfile` using Node LTS base image (mirrors user-service pattern)
- [x] T008 [P] Add `product-service` block to root `docker-compose.yml` (port 3003, depends_on mongodb and redis)

**Checkpoint**: `npm run build` succeeds; `npm test` runs (zero tests, zero failures); Docker image builds cleanly.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user story implementations depend on. Must be fully complete before Phase 3 begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T009 Create `services/product-service/src/config/env.ts` — zod schema validating all required env vars (`PORT`, `JWT_SECRET`, `MONGODB_URI`, `REDIS_URL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `LOG_LEVEL`, `NODE_ENV`, `CORS_ORIGIN`)
- [x] T010 [P] Create `services/product-service/src/config/db.ts` — Mongoose connection factory (reads `MONGODB_URI` from env; handles connect/disconnect for test lifecycle)
- [x] T011 [P] Create `services/product-service/src/config/redis.ts` — ioredis client singleton (reads `REDIS_URL` from env; used by rate-limiter only)
- [x] T012 [P] Create `services/product-service/src/config/logger.ts` — structured logger; redacts sensitive values; used across all modules
- [x] T012a Create `services/product-service/src/errors.ts` — define `NotFoundError` (extends `Error`, HTTP status 404) and `ValidationError` (extends `Error`, HTTP status 400); export both for use in service layer and `errorHandler.ts`
- [x] T013 Create `services/product-service/src/middleware/errorHandler.ts` — global Express error handler; maps known error types to HTTP status codes; never exposes stack traces in non-development environments
- [x] T014 [P] Create `services/product-service/src/middleware/rateLimiter.ts` — `express-rate-limit` middleware with `rate-limit-redis` store (reads `REDIS_URL`; distributed, survives restarts); reads window/max from env; applied globally at app level
- [x] T015 [P] Create `services/product-service/src/middleware/auth.middleware.ts` — extract `Authorization: Bearer <token>`; call `jwt.verify(token, JWT_SECRET)`; attach decoded payload to `res.locals.user`; return `401 Unauthorised` on any failure; emit structured log on auth success (`userId`, endpoint, timestamp) and auth failure (reason, endpoint); no other business logic
- [x] T016 Create `services/product-service/src/validators/product.validators.ts` — four zod schemas: `CreateProductSchema`, `UpdateProductSchema` (with `.refine` for non-empty body), `ListQuerySchema` (with `z.coerce` for page/limit), `IdParamSchema` (24-hex ObjectId regex)
- [x] T016a [P] Write unit tests for all four zod schemas in `tests/unit/product.validators.test.ts`: `CreateProductSchema` rejects missing required fields and strips unknown fields; `UpdateProductSchema` rejects empty body; `ListQuerySchema` coerces string query params and applies defaults (page=1, limit=20); `IdParamSchema` rejects strings shorter than 24 hex chars
- [x] T017 Create `services/product-service/src/models/product.model.ts` — Mongoose schema matching `IProduct` interface from data-model.md; `timestamps: true`; `toJSON` transform: rename `_id → id`, remove `__v`; index on `createdAt`
- [x] T018 Create `services/product-service/tests/setup.ts` — Jest `globalSetup`/`globalTeardown` that starts and stops `mongodb-memory-server`; exports connection helper for test files
- [x] T019 Create `services/product-service/src/routes/product.routes.ts` with 5 stub route handlers each returning `501 Not Implemented` (GET `/`, GET `/:id`, POST `/`, PATCH `/:id`, DELETE `/:id`); then wire `auth.middleware`, `rateLimiter`, `cors` (configured with `origin: env.CORS_ORIGIN`; no wildcard `*` in non-development environments), `errorHandler`, and the product router into `services/product-service/src/app.ts`

**Checkpoint**: Service starts without error; all 5 product routes return 501 Not Implemented; MongoDB connects via memory server in tests; JWT middleware rejects requests missing a token with 401; env validation rejects missing vars at startup.

---

## Phase 3: User Story 1 — Browse and Retrieve Products (Priority: P1) 🎯 MVP

**Goal**: An authenticated user can list all products (paginated) and retrieve a single product by ID. Unauthenticated requests are rejected.

**Independent Test**: Start the product-service with a seeded in-memory MongoDB. `GET /api/products` with a valid JWT returns `{ data, total, page, limit, totalPages }`. `GET /api/products/:id` returns the full product object. Requests without a token return 401. Requests for a non-existent ID return 404.

### Tests for User Story 1 (Constitution IV — Test-First, write before implementation)

- [x] T020 [P] [US1] Write contract tests for `GET /api/products` in `tests/contract/product.contract.test.ts`: valid JWT + empty DB → 200 + empty data array; valid JWT + seeded DB → 200 + paginated shape; missing token → 401; invalid `page=0` → 400
- [x] T021 [P] [US1] Write contract tests for `GET /api/products/:id` in `tests/contract/product.contract.test.ts`: valid JWT + existing product → 200 + full product shape; valid JWT + unknown ID → 404; invalid ObjectId → 400; missing token → 401
- [x] T022 [P] [US1] Write unit tests for list and get operations in `tests/unit/product.service.test.ts`: `listProducts` returns correct pagination envelope; `getProductById` returns product on hit; `getProductById` throws `NotFoundError` when no document; pagination defaults applied when params absent

### Implementation for User Story 1

- [x] T023 [US1] Implement `listProducts(page, limit)` in `src/services/product.service.ts` — query MongoDB with `.skip((page-1)*limit).limit(limit).sort({ createdAt: -1 })`; run parallel `countDocuments()`; return `{ data, total, page, limit, totalPages }`
- [x] T024 [US1] Implement `getProductById(id)` in `src/services/product.service.ts` — `Product.findById(id)`; throw `NotFoundError` if null; return product document
- [x] T025 [US1] Implement `GET /api/products` route handler in `src/routes/product.routes.ts` — validate query params with `ListQuerySchema`; call `productService.listProducts`; return 200 with pagination envelope
- [x] T026 [US1] Implement `GET /api/products/:id` route handler in `src/routes/product.routes.ts` — validate `:id` with `IdParamSchema`; call `productService.getProductById`; return 200 with product; map `NotFoundError` → 404

**Checkpoint**: All Phase 3 tests pass. `GET /api/products` and `GET /api/products/:id` are fully functional. US1 MVP delivered.

---

## Phase 4: User Story 2 — Create a New Product (Priority: P2)

**Goal**: An authenticated user can create a product by POSTing required fields. The created product is immediately retrievable. Invalid or incomplete payloads are rejected with field-level errors.

**Independent Test**: `POST /api/products` with a valid JWT and complete body returns 201 with the new product (including generated `id`, `createdAt`, `updatedAt`). Missing required field returns 400 with a `details` array. Negative price returns 400. Missing token returns 401.

### Tests for User Story 2 (Constitution IV — Test-First, write before implementation)

- [x] T027 [P] [US2] Write contract tests for `POST /api/products` in `tests/contract/product.contract.test.ts`: valid body + valid JWT → 201 + created product shape; missing `name` → 400 + details; missing `price` → 400; `price: -1` → 400; `stock: -5` → 400; missing token → 401
- [x] T028 [P] [US2] Write unit tests for create operation in `tests/unit/product.service.test.ts`: `createProduct` persists document and returns it with all required fields; extra unknown fields are stripped before persist

### Implementation for User Story 2

- [x] T029 [US2] Implement `createProduct(data)` in `src/services/product.service.ts` — `new Product(data).save()`; return saved document
- [x] T030 [US2] Implement `POST /api/products` route handler in `src/routes/product.routes.ts` — validate body with `CreateProductSchema`; call `productService.createProduct`; return 201 with created product

**Checkpoint**: All Phase 4 tests pass. `POST /api/products` is fully functional and US2 is independently testable alongside US1.

---

## Phase 5: User Story 3 — Update an Existing Product (Priority: P3)

**Goal**: An authenticated user can partially update a product. Only supplied fields change; all others retain current values. Non-existent product ID returns 404.

**Independent Test**: `PATCH /api/products/:id` with `{ "price": 69.99 }` returns 200 with the full updated product where only `price` and `updatedAt` changed. Empty body returns 400. Non-existent ID returns 404. Missing token returns 401.

### Tests for User Story 3 (Constitution IV — Test-First, write before implementation)

- [x] T031 [P] [US3] Write contract tests for `PATCH /api/products/:id` in `tests/contract/product.contract.test.ts`: single-field update → 200 + full updated product shape; unchanged fields retain values; empty body → 400; `price: 0` → 400; invalid ObjectId → 400; unknown ID → 404; missing token → 401
- [x] T032 [P] [US3] Write unit tests for update operation in `tests/unit/product.service.test.ts`: `updateProduct` returns updated document with `runValidators: true` applied; throws `NotFoundError` when no document matches; extra fields stripped by zod before reaching service

### Implementation for User Story 3

- [x] T033 [US3] Implement `updateProduct(id, data)` in `src/services/product.service.ts` — `Product.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })`; throw `NotFoundError` if result is null; return updated document
- [x] T034 [US3] Implement `PATCH /api/products/:id` route handler in `src/routes/product.routes.ts` — validate `:id` with `IdParamSchema`; validate body with `UpdateProductSchema`; call `productService.updateProduct`; return 200 with updated product; map `NotFoundError` → 404

**Checkpoint**: All Phase 5 tests pass. `PATCH /api/products/:id` is fully functional. US3 independently testable.

---

## Phase 6: User Story 4 — Delete a Product (Priority: P4)

**Goal**: An authenticated user can permanently delete a product. Subsequent retrieval of the deleted product returns 404. Non-existent ID returns 404 at delete time.

**Independent Test**: `DELETE /api/products/:id` with a valid JWT returns 200 `{ "message": "Product deleted successfully" }`. A subsequent `GET /api/products/:id` for the same ID returns 404. Deleting a non-existent ID returns 404. Missing token returns 401.

### Tests for User Story 4 (Constitution IV — Test-First, write before implementation)

- [x] T035 [P] [US4] Write contract tests for `DELETE /api/products/:id` in `tests/contract/product.contract.test.ts`: valid JWT + existing product → 200 + message; subsequent GET → 404; unknown ID → 404; invalid ObjectId → 400; missing token → 401
- [x] T036 [P] [US4] Write unit tests for delete operation in `tests/unit/product.service.test.ts`: `deleteProduct` calls `findByIdAndDelete`; throws `NotFoundError` when result is null

### Implementation for User Story 4

- [x] T037 [US4] Implement `deleteProduct(id)` in `src/services/product.service.ts` — `Product.findByIdAndDelete(id)`; throw `NotFoundError` if result is null
- [x] T038 [US4] Implement `DELETE /api/products/:id` route handler in `src/routes/product.routes.ts` — validate `:id` with `IdParamSchema`; call `productService.deleteProduct`; return 200 `{ message: "Product deleted successfully" }`; map `NotFoundError` → 404

**Checkpoint**: All Phase 6 tests pass. `DELETE /api/products/:id` is fully functional. All four user stories now independently testable and complete.

---

## Phase 7: Integration Tests & Polish

**Purpose**: Full end-to-end flow validation across all stories, `.env.example`, and quickstart verification.

- [x] T039 Write integration tests in `tests/integration/product.integration.test.ts` — full CRUD lifecycle: create → list → get → update → delete using mongodb-memory-server; assert pagination envelope shape; assert 401 on all routes without token; assert 404 on missing product across all write operations
- [x] T040 [P] Create `services/product-service/.env.example` with all required env vars as placeholders (PORT=3003, MONGODB_URI, JWT_SECRET, REDIS_URL, CORS_ORIGIN=http://localhost:3000, RATE_LIMIT_WINDOW_MS=60000, RATE_LIMIT_MAX=100, LOG_LEVEL=info, NODE_ENV=development)
- [x] T041 [P] Add `scripts` block to `services/product-service/package.json`: `build`, `start`, `dev`, `test`, `lint`, `format`
- [x] T042 [P] Verify all error responses match contract shape `{ "error": "...", "details"?: [...] }` across all route handlers and errorHandler middleware; no stack traces leaked
- [x] T043 [P] Confirm `auth.middleware.ts` is applied to all five routes via router-level middleware (not per-handler); write a test confirming that a request to any route without a valid token returns 401 — verifying global middleware coverage rather than per-handler guarding
- [x] T046 [P] Write `tests/performance/list.perf.test.ts` — seed 10,000 products in mongodb-memory-server; assert `GET /api/products` p95 response time < 1,000 ms with a valid JWT (SC-001)
- [x] T047 [P] Write `tests/performance/write.perf.test.ts` — run 50 sequential POST, PATCH, and DELETE operations; assert each p95 < 500 ms with a valid JWT (SC-002)
- [x] T048 [P] Write `tests/performance/concurrent.perf.test.ts` — fire 500 concurrent `GET /api/products` requests; assert all complete without error and p95 < 1,000 ms (SC-005)
- [x] T044 Run full test suite (`npm test`); confirm 80% coverage gate passes; fix any gaps in coverage
- [x] T045 [P] Validate quickstart.md accuracy: confirm port (3003), all env var names, and curl examples match actual implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — independently testable after Phase 2
- **US2 (Phase 4)**: Depends on Phase 2 — independently testable; may run in parallel with US1
- **US3 (Phase 5)**: Depends on Phase 2 — requires an existing product (US2 or seeded data); runs after US2
- **US4 (Phase 6)**: Depends on Phase 2 — requires an existing product (US2 or seeded data); runs after US2
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependency on other stories; read-only operations work on any seeded data
- **US2 (P2)**: Can start after Phase 2 — no dependency on other stories; creates the data other stories consume
- **US3 (P3)**: Can start after Phase 2 — logically depends on US2 for test data but is independently implementable with seeded fixtures
- **US4 (P4)**: Can start after Phase 2 — same as US3

### Within Each User Story

1. Tests MUST be written and confirmed FAILING before any implementation task begins
2. Validators before service before route handler
3. Story complete (all tests green) before marking the phase done

---

## Parallel Opportunities

### Phase 1

```
T002 (runtime deps) ║ T003 (dev deps) ║ T004 (jest config) ║ T007 (Dockerfile) ║ T008 (docker-compose)
```

### Phase 2

```
T010 (db config) ║ T011 (redis config) ║ T012 (logger) ║ T012a (errors) ║ T014 (rateLimiter) ║ T015 (auth middleware) ║ T016 (validators) ║ T016a (validator unit tests) ║ T017 (model)
```

### Within each User Story Phase

```
All test tasks [P] can be written simultaneously (different test files)
```

### Across User Stories (after Phase 2)

```
US1 (Phase 3) ║ US2 (Phase 4)   — can proceed in parallel
US3 (Phase 5) ║ US4 (Phase 6)   — can proceed in parallel after US2 establishes data fixtures
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **CRITICAL, blocks everything**
3. Complete Phase 3: US1 (List + Get)
4. **STOP and VALIDATE**: `GET /api/products` and `GET /api/products/:id` work end-to-end with a real JWT
5. Demo / deploy if ready; then continue to US2

### Full Delivery Order (Recommended)

```
Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) + Phase 6 (US4) in parallel → Phase 7
```

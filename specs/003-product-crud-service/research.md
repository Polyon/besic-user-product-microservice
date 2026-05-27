# Research: Product CRUD Service

**Branch**: `003-product-crud-service` | **Date**: 2026-05-27  
**Purpose**: Resolve all technical decisions before Phase 1 design begins.
All items below were identified from the Technical Context and constitution alignment.

---

## 1. JWT Token Verification (Cross-Service)

**Question**: How should the Product Service validate tokens issued by the Auth Service
without making a synchronous call to the Auth Service on every request?

### Decision: Stateless HS256 verification via shared `JWT_SECRET`

**Rationale**:
- The Auth Service signs tokens with `JWT_SECRET` (256-bit minimum, from env).
- The Product Service reads the same `JWT_SECRET` from its own env and calls
  `jwt.verify(token, secret)` inside `auth.middleware.ts`.
- On success, the decoded payload (`userId`, `email`, `iat`, `exp`) is attached to
  `res.locals.user` for use in route handlers.
- On failure (invalid signature, expired token, missing token), the middleware
  immediately returns `401 Unauthorized` — no product handler runs.

**Established by**: [research.md for 001-user-service](../001-user-service/research.md) — identical
pattern; reused without modification.

**Alternatives considered**:
- **RS256 asymmetric**: Deferred. More secure public-key distribution but adds setup
  complexity. Documented as a future upgrade path.
- **Auth Service introspection endpoint**: Rejected — synchronous inter-service call on
  every request violates Principle II (Service Independence) and introduces latency.

**Implementation**: `src/middleware/auth.middleware.ts` — extract `Authorization: Bearer <token>`,
call `jwt.verify`, attach payload to `res.locals.user`, call `next()` on success.

---

## 2. MongoDB Schema Design for Products

**Question**: What is the optimal Mongoose schema for the Product entity given the
requirements and the constitution's mandate that Mongoose schemas enforce type definitions
consistent with TypeScript models?

### Decision: Single flat Mongoose document with `timestamps: true`

**Rationale**:
- The Product entity has no nested sub-documents that would warrant embedded models.
- `category` is stored as a free-form string (no separate Category collection in v1 — YAGNI).
- Mongoose's built-in `timestamps: true` option automatically manages `createdAt`/`updatedAt`.
- `toJSON` transform renames `_id → id` (string), removes `__v` — consistent with User Service pattern.

**Schema fields**:

| Field | Mongoose type | Constraints |
|-------|--------------|-------------|
| `name` | `String` | required, trim, maxlength 200 |
| `description` | `String` | optional, trim, maxlength 2000 |
| `price` | `Number` | required, min 0.01 |
| `category` | `String` | required, trim, maxlength 100 |
| `stock` | `Number` | required, integer, min 0 |
| `createdAt` | `Date` | auto (timestamps) |
| `updatedAt` | `Date` | auto (timestamps) |

**Alternatives considered**:
- **Separate Category collection**: Rejected for v1 (YAGNI — no requirement to manage
  categories independently).
- **Decimal128 for price**: Rejected — JavaScript `Number` is sufficient for price values
  up to 10k products; Decimal128 adds serialisation complexity with no benefit at this scale.

---

## 3. Pagination Strategy for Product List

**Question**: What pagination approach best fits a read-heavy product catalog with up to
10,000 products and a sub-1-second list response target?

### Decision: Offset-based pagination (`?page=1&limit=20`)

**Rationale**:
- Simple to implement, debug, and document.
- Standard REST convention expected by most client consumers.
- At ≤ 10,000 documents, MongoDB offset queries with an index on `_id` comfortably meet
  the < 1 s p95 target — cursor-based pagination is not required at this scale.
- Response includes `{ data: [], total, page, limit, totalPages }` envelope for
  client-side pagination controls.

**Default values**: `page=1`, `limit=20`, `maxLimit=100` (enforced by zod).

**Alternatives considered**:
- **Cursor-based pagination**: Better for very large datasets (> 1M docs) or real-time
  feeds. Rejected for v1 — YAGNI at ≤ 10k products.
- **Keyset pagination**: Same trade-off as cursor-based; deferred.

---

## 4. Partial Update Strategy (PATCH vs. PUT)

**Question**: Should the update endpoint use `PATCH` (partial) or `PUT` (full replacement)?

### Decision: `PATCH /api/products/:id` with partial update semantics

**Rationale**:
- Spec FR-006 explicitly requires partial updates ("only provided fields are changed").
- `PATCH` communicates intent to consumers correctly.
- Mongoose's `.findByIdAndUpdate({ $set: updates }, { new: true, runValidators: true })`
  applies only the provided fields, re-runs validators on changed fields, and returns
  the updated document atomically.
- `runValidators: true` ensures schema-level constraints (min price, non-negative stock)
  are enforced on partial updates, not just on creation.

**Alternatives considered**:
- **PUT (full replacement)**: Rejected — would require clients to always send all fields,
  increasing risk of accidental field wipe-out.

---

## 5. Redis Usage Scope

**Question**: Should Redis be used for product caching in addition to rate limiting?

### Decision: Rate-limit counters only (no product cache in v1)

**Rationale**:
- Spec SC-001 targets < 1 s for ≤ 10,000 products. A MongoDB query with an `_id` index
  returns a single document in < 10 ms and a paginated list of 20 in < 50 ms — well within
  the target without caching.
- Adding a cache introduces invalidation complexity and Redis key management with no
  observable benefit at the stated scale.
- Constitution Principle V (Simplicity & YAGNI): complexity must be justified in writing.
- Redis MUST NOT be used as a primary data store for business entities (constitution).

**Deferred to a future iteration** if profiling reveals list queries exceeding SLO under real load.

**Alternatives considered**:
- **Cache-Aside for GET /api/products/:id**: Deferred. Identical to User Service's cache
  pattern. Can be adopted in a future iteration by adding `product:{productId}` keys with
  a TTL and invalidating on update/delete.

---

## 6. Error Response Shape

**Question**: What error response envelope should the Product Service use to remain
consistent with existing services?

### Decision: `{ "error": "<message>", "details": [...] }` — same as User/Auth Service

**Rationale**:
- Consistency across services reduces client integration effort.
- `details` array is included only when validation errors provide field-level context
  (zod `.flatten()` format).
- No stack traces, internal error messages, or DB query details in any response.

**Error HTTP codes**:

| Scenario | HTTP Status |
|----------|-------------|
| Missing/invalid/expired token | 401 Unauthorized |
| Product not found | 404 Not Found |
| Validation failure | 400 Bad Request |
| Duplicate (future use) | 409 Conflict |
| Unexpected server error | 500 Internal Server Error |

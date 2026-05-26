# Research: Simple User Service

**Branch**: `001-user-service` | **Date**: 2026-05-26  
**Purpose**: Resolve all NEEDS CLARIFICATION items from Technical Context and establish
best-practice decisions before Phase 1 design begins.

---

## 1. Redis Caching Strategy

**Unknown**: Which cache pattern best fits a read-heavy profile service with write
invalidation?

### Decision: Cache-Aside (Lazy Loading)

**Rationale**:
- On every `GET /api/users/:id`, the service checks Redis first.
  - Cache hit → return immediately (no MongoDB query).
  - Cache miss → query MongoDB, write result to Redis with TTL, return result.
- On every `PATCH /api/users/:id` or `DELETE /api/users/:id`, the cache key for that
  user is deleted (invalidated) immediately after the MongoDB write succeeds.
- On `POST /api/users` (registration), no cache write is needed — the profile has
  not been read yet; it will be populated on the first GET.

**Alternatives considered**:
- **Write-through** (write to both MongoDB + Redis on every mutating request): rejected —
  adds latency on writes for a benefit only realised on subsequent reads; over-engineers
  the write path.
- **Read-through** (cache layer fetches from DB transparently): rejected — requires a
  caching proxy or framework; cache-aside is simpler and gives the service explicit
  control over invalidation.

### Cache Key Design

| Operation | Redis Key | TTL |
|-----------|-----------|-----|
| GET user by id | `user:{userId}` | `CACHE_TTL_SECONDS` (default: 300 s) |
| Invalidate on update | DEL `user:{userId}` | — |
| Invalidate on delete | DEL `user:{userId}` | — |

**Key format justification**: Namespace prefix `user:` scopes keys within the shared Redis
instance, preventing collisions if other services share the same Redis (e.g., Auth Service
token revocation keys use prefix `revoked:`).

### Stored Value

The cached value is the sanitised public user object (id, name, email, createdAt, updatedAt)
serialised as JSON. The password hash is NEVER included in the cached representation.

### Cache TTL

- Default: **300 seconds** (5 minutes), configurable via `CACHE_TTL_SECONDS` env var.
- Chosen as a balance: short enough that stale reads after an update are bounded, long
  enough to absorb repeated reads under the 500-concurrent-user load target.

---

## 2. JWT Validation in Express Middleware

**Unknown**: How should a downstream service (User Service) validate a token that was
issued by a separate Auth Service?

### Decision: Shared-Secret HMAC (HS256) with `jsonwebtoken` verify

**Rationale**:
- The Auth Service signs tokens with `JWT_SECRET` (256-bit minimum, from env).
- The User Service reads the same `JWT_SECRET` from its own env and calls
  `jwt.verify(token, secret)` in `authMiddleware.ts`.
- On success, the decoded payload (containing `userId`, `email`, `iat`, `exp`) is
  attached to `res.locals.user` for use in route handlers.
- On failure (invalid signature, expired), the middleware immediately returns
  `401 Unauthorized` with a generic message — no handler runs.

**Alternatives considered**:
- **RS256 asymmetric**: More secure (public key distributed to consumer services, private
  key stays with Auth Service). Rejected for this version to keep initial setup simple
  (Principle V). Noted as a future upgrade path.
- **Introspection endpoint** (User Service calls Auth Service on every request to validate
  token): Rejected — introduces synchronous inter-service dependency, defeats the purpose
  of stateless JWTs, and violates Principle II (Service Independence).

### Token Payload Contract (from Auth Service)

```json
{
  "userId": "<MongoDB ObjectId string>",
  "email": "user@example.com",
  "iat": 1716700000,
  "exp": 1716703600
}
```

The `userId` in the token is used to scope all protected operations (read, update, delete)
to the authenticated user's own record.

---

## 3. Request Validation with Zod

**Unknown**: Which validation library and schema design to use?

### Decision: Zod 3.x with schema-per-endpoint

**Rationale**:
- Zod provides TypeScript-native type inference from schemas (`z.infer<typeof schema>`),
  eliminating a separate type definition for request payloads.
- `.strict()` on object schemas rejects unknown fields, satisfying the edge case
  "unknown fields are silently ignored" — actually: with `.strip()` (default) they are
  stripped, which is the desired behaviour per the spec edge case.
- Error messages are structured and can be mapped to user-friendly strings without
  leaking implementation details.

**Alternatives considered**:
- **Joi**: More verbose; no TypeScript type inference from schema; rejected.
- **class-validator + class-transformer**: Requires decorators; boilerplate heavy; rejected.

### Schemas

| Endpoint | Schema fields |
|----------|---------------|
| `POST /api/users` | `name: string (1–100 chars)`, `email: string email format`, `password: string (≥ 8 chars)` |
| `PATCH /api/users/:id` | At least one of: `name?`, `email?`, `password?` (all optional but min 1 required) |

---

## 4. Password Hashing with bcrypt

**Unknown**: Configuration and usage pattern.

### Decision: `bcrypt` npm package, cost factor 12, async API

**Rationale**:
- Cost factor 12 balances security (OWASP recommendation) with latency (< 300 ms on
  modern hardware for a single hash, acceptable for registration and login).
- Async `bcrypt.hash` / `bcrypt.compare` used exclusively — synchronous bcrypt MUST NOT
  be used in an async Express handler as it blocks the event loop.
- Hash result stored in `user.passwordHash`; the field is excluded from all outgoing
  serialisations via a `toJSON` transform on the Mongoose schema.

---

## 5. MongoDB Unique Index Strategy

**Unknown**: How to enforce email uniqueness and handle concurrent duplicate registrations?

### Decision: Mongoose unique index + duplicate-key error handling

**Rationale**:
- `email` field declared with `unique: true` in the Mongoose schema → MongoDB creates a
  unique index automatically.
- Concurrent duplicate registrations are safely rejected at the database level (no
  application-level race condition).
- The global error handler catches MongoDB error code `11000` (duplicate key) and maps
  it to HTTP `409 Conflict` with a safe message ("Email already in use").

---

## 6. Structured Logging

**Unknown**: Which logging approach satisfies the observability requirement (FR-010)?

### Decision: `pino` with JSON output

**Rationale**:
- Pino is the fastest Node.js JSON logger; integrates well with Express via
  `pino-http` middleware.
- Each protected-endpoint request automatically emits a log entry including: method,
  path, status code, userId (from token), response time, and outcome.
- In development, `pino-pretty` formats output for readability.
- No secrets (tokens, passwords) are ever logged — pino-http is configured to redact
  `req.headers.authorization`.

**Alternatives considered**:
- **Winston**: Heavier; less performant; rejected.
- **console.log**: No structured output, not suitable for production; rejected.

---

## Summary of All Decisions

| Area | Decision | Version / Config |
|------|----------|-----------------|
| Caching pattern | Cache-aside (lazy loading) | Redis TTL: 300 s (env configurable) |
| Cache key format | `user:{userId}` | Namespace prefixed |
| JWT validation | HS256 shared secret, `jsonwebtoken.verify` | `JWT_SECRET` from env |
| Request validation | Zod 3.x, `.strip()` on unknowns | Schema per endpoint |
| Password hashing | bcrypt async, cost 12 | `bcrypt` npm package |
| Email uniqueness | MongoDB unique index + error code 11000 handling | Mongoose `unique: true` |
| Structured logging | `pino` + `pino-http` | JSON in prod, pretty in dev |

All NEEDS CLARIFICATION items resolved. Ready for Phase 1 design.

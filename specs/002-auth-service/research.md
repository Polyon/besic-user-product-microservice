# Research: Authentication Service

**Branch**: `002-auth-service` | **Date**: 2026-05-27  
**Source**: [spec.md](spec.md) → Technical Context unknowns + dependency best practices

---

## 1. Credential Verification — How Auth Service Reads User Data

**Decision**: Auth Service calls `POST /api/internal/verify-credentials` on the User Service via HTTP.

**Rationale**: Constitution Principle II prohibits direct database sharing between services. Service-to-service REST is the compliant pattern. The User Service exposes a narrow internal endpoint that accepts an email + plaintext password, performs the bcrypt comparison internally, and returns the user's public identity (id, email) on success. This keeps password-hashing logic in one place (User Service) and avoids the Auth Service ever handling raw password hashes.

**Alternatives considered**:
- Direct MongoDB access to user-service DB — REJECTED: violates Constitution Principle II (Service Independence).
- Auth Service stores a password-hash replica — REJECTED: data duplication, violates YAGNI and service ownership.
- gRPC for inter-service communication — REJECTED: adds complexity (proto files, codegen); REST is sufficient and aligns with project stack.

**Impact on User Service**: A new internal endpoint must be added to the User Service: `POST /api/internal/verify-credentials`. This endpoint is NOT exposed publicly and MUST NOT be rate-limited in the same way as public endpoints (it is called only by the trusted Auth Service on the internal network).

---

## 2. Access Token Strategy

**Decision**: Short-lived JWT (HS256), signed with a 256-bit secret from environment. Payload: `{ sub: userId, email, iat, exp }`. Default expiry: 15 minutes (configurable via `JWT_ACCESS_EXPIRES_IN` env var).

**Rationale**: HS256 with a strong secret is constitutionally permitted and simpler than RS256 for a single-signer scenario. A shared secret between Auth Service and any service that verifies tokens is distributed via environment variables (standard practice in container orchestration). If asymmetric signing is needed in the future (multiple independent signers), an RS256 migration is straightforward.

**Token claims**:
| Claim | Value | Notes |
|-------|-------|-------|
| `sub` | User's MongoDB ObjectId (string) | Primary identity reference |
| `email` | User's email address | Convenience — avoids downstream lookup for display |
| `iat` | Issued-at timestamp | Standard JWT claim |
| `exp` | Expiry timestamp | `iat + JWT_ACCESS_EXPIRES_IN` seconds |

**Alternatives considered**:
- RS256 (asymmetric) — deferred: beneficial when multiple services need to verify without sharing a secret, but adds key management complexity. Revisit when a third service is added.
- Opaque access tokens with introspection — REJECTED: requires a network call to Auth Service on every protected endpoint, defeating stateless verification (violates SC-002: <50 ms overhead).

---

## 3. Refresh Token Strategy

**Decision**: Opaque UUID v4 stored as a Redis key with TTL. Not a JWT. Default expiry: 7 days (configurable via `JWT_REFRESH_EXPIRES_IN` env var).

**Redis key structure**:
```
auth:refresh:{tokenValue}  →  JSON: { userId, email, issuedAt }   TTL: 7 days
```

**Rationale**: Opaque tokens are simpler to revoke than JWTs (delete the Redis key = instant revocation). Constitution mandates Redis for JWT revocation/invalidation lists — using Redis as the refresh token store directly satisfies this without a secondary revocation list. UUID v4 is cryptographically random and unpredictable (128 bits of entropy), making brute-force enumeration infeasible.

**Refresh token rotation**: On every successful `POST /auth/refresh`, the old refresh token is deleted from Redis and a new one is issued. This limits the exposure window of any single refresh token.

**Replay detection**: When a refresh token is used and then the same value is presented again, Redis will return `null` (already deleted). This is treated as a replay attack — the response is HTTP 401 and no new tokens are issued.

**Alternatives considered**:
- JWT refresh tokens — REJECTED: cannot be individually revoked without maintaining a denylist (same complexity as Redis store, worse ergonomics).
- MongoDB for refresh token storage — REJECTED: YAGNI; Redis is already in the stack for this exact purpose per constitution.

---

## 4. Brute-Force Protection

**Decision**: `express-rate-limit` middleware scoped to `POST /auth/login`. Window: 15 minutes. Max attempts: 10 per IP. Response on limit: HTTP 429 with `Retry-After` header.

**Rationale**: Constitution requires `express-rate-limit` on all public endpoints. 10 attempts per 15-minute window follows OWASP recommendations for login endpoint protection. IP-based limiting is the minimum viable approach; user-based limiting (per email) can be layered in a future iteration.

**Redis integration**: The rate-limit store uses `ioredis` backend (`rate-limit-redis`) so counters survive Auth Service restarts and are shared across multiple instances.

**Alternatives considered**:
- In-memory rate limiting — REJECTED: state lost on restart; does not work across multiple service instances.
- CAPTCHA — deferred: adds client-side complexity, out of scope for v1.

---

## 5. Logout & Token Revocation

**Decision**: `POST /auth/logout` deletes the refresh token from Redis. The associated access token is NOT revoked (it expires naturally within its short TTL of 15 minutes).

**Rationale**: Stateless access token revocation requires maintaining a denylist of every active access token — this adds Redis I/O to every `POST /auth/verify` call. Given the 15-minute default TTL, the security exposure window is acceptable. This is the standard industry trade-off for stateless JWTs. If near-instant access token revocation is needed in future, a Redis denylist keyed on `jti` (JWT ID) can be added without changing the overall architecture.

**Alternatives considered**:
- Revoke access token on logout (Redis denylist) — deferred: adds latency to every token verification; acceptable future enhancement.
- Token blacklist for all tokens — REJECTED: scales poorly; defeats stateless verification benefit.

---

## 6. Service-to-Service Trust Model

**Decision**: The User Service's `POST /api/internal/verify-credentials` endpoint is protected by a shared internal API key passed as a request header (`X-Internal-Api-Key`). Both services read the key from the same environment variable (`INTERNAL_API_KEY`).

**Rationale**: In a trusted internal network (Docker Compose / Kubernetes namespace), network-level isolation is the primary control. The API key provides a defence-in-depth layer against accidental exposure of the internal endpoint. mTLS is deferred (infrastructure concern, out of scope for v1).

**Alternatives considered**:
- No authentication on internal endpoint (network isolation only) — REJECTED: defence-in-depth requires at least one application-level check.
- JWT-signed service tokens — deferred: overkill for two services; revisit when services scale.

---

## 7. MongoDB Requirement

**Decision**: Auth Service does NOT require its own MongoDB instance. All service state is ephemeral (refresh tokens, rate-limit counters) and fits in Redis with TTL semantics.

**Rationale**: Constitution Principle V (YAGNI) — do not add infrastructure not required by the feature. Redis already handles all Auth Service persistence needs.

**Impact**: `docker-compose.yml` does not need a new MongoDB container for auth-service. Redis is already declared for user-service and can be shared (different key prefixes ensure isolation: `auth:*` vs `user:*`).

---

## 8. Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Auth service HTTP port | `3001` |
| `JWT_SECRET` | HS256 signing secret (≥ 256 bits) | — (required) |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL (seconds) | `900` (15 min) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL (seconds) | `604800` (7 days) |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `USER_SERVICE_URL` | Base URL of User Service | `http://user-service:3000` |
| `INTERNAL_API_KEY` | Shared key for internal service calls | — (required) |
| `RATE_LIMIT_WINDOW_MS` | Login rate-limit window | `900000` (15 min) |
| `RATE_LIMIT_MAX` | Max login attempts per window | `10` |
| `NODE_ENV` | Environment flag | `development` |

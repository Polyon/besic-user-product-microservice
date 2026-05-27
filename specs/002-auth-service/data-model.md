# Data Model: Authentication Service

**Branch**: `002-auth-service` | **Date**: 2026-05-27  
**Source**: [spec.md](spec.md) → Key Entities | [research.md](research.md)

---

## Overview

The Authentication Service owns **no MongoDB database**. All persistent state is
ephemeral session data stored in Redis with automatic expiry (TTL). There are two
logical data structures owned by this service:

1. **Refresh Token** — tracks an active session; stored as a Redis key.
2. **Rate-Limit Counter** — per-IP attempt counter for the login endpoint; managed by
   `express-rate-limit` + `rate-limit-redis` automatically (no manual schema required).

---

## Redis Schema

Redis is the **sole data store** for the Authentication Service. It is NOT shared with
any other service. All keys are namespaced under the `auth:` prefix to avoid collisions
with the User Service's `user:` keys.

### 1. Refresh Token

Represents an active, revocable session for a user.

| Key Pattern | `auth:refresh:{tokenValue}` |
|-------------|----------------------------|
| **Value** | JSON string (see structure below) |
| **TTL** | `JWT_REFRESH_EXPIRES_IN` seconds (default: 604 800 s = 7 days) |
| **Set On** | Successful `POST /auth/login` or `POST /auth/refresh` |
| **Deleted On** | `POST /auth/logout` (explicit revocation); `POST /auth/refresh` (old token replaced); TTL expiry (automatic) |

**Key format**: `auth:refresh:<uuid-v4>` where `<uuid-v4>` is a cryptographically random
128-bit UUID, URL-safe and opaque to the client.

**Value structure** (JSON-serialised string stored in Redis):

```json
{
  "userId": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "jane@example.com",
  "issuedAt": "2026-05-27T10:00:00.000Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `userId` | string | MongoDB ObjectId of the user (from User Service) |
| `email` | string | User's email at time of issuance (snapshot for logging only) |
| `issuedAt` | string | ISO 8601 timestamp of when this token was created |

**TypeScript representation** (service-internal):

```typescript
interface RefreshTokenPayload {
  userId: string;        // MongoDB ObjectId string
  email: string;         // Snapshot — not used for identity decisions
  issuedAt: string;      // ISO 8601
}
```

**Lifecycle**:

```
[Login Success]     ──── SET auth:refresh:{uuid} (TTL 7d) ────► [Active]
[Refresh Success]   ──── DEL old key; SET auth:refresh:{new-uuid} ─► [Rotated]
[Logout]            ──── DEL auth:refresh:{uuid} ─────────────► [Revoked]
[TTL Expires]       ──── Redis auto-evicts ───────────────────► [Expired]
[Replay Detected]   ──── GET returns null → 401, no new token ► [Blocked]
```

### 2. Rate-Limit Counter (managed automatically)

| Key Pattern | `rl:{ip}:{windowStart}` (managed by `rate-limit-redis`) |
|-------------|--------------------------------------------------------|
| **Value** | Integer counter |
| **TTL** | `RATE_LIMIT_WINDOW_MS` / 1000 seconds (default: 900 s) |
| **Managed By** | `express-rate-limit` + `rate-limit-redis` middleware |

No manual interaction with this key is required. The schema is documented for
operational visibility only.

---

## Access Token (Stateless — Not Stored)

Access tokens are NOT stored anywhere on the server. They are short-lived, self-contained
JWTs verified by checking the signature and `exp` claim.

**Algorithm**: HS256  
**Secret**: `JWT_SECRET` environment variable (≥ 256 bits required)  
**Default expiry**: 900 seconds (15 minutes), configurable via `JWT_ACCESS_EXPIRES_IN`

**JWT Payload structure**:

```json
{
  "sub": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "jane@example.com",
  "iat": 1716800400,
  "exp": 1716801300
}
```

| Claim | Type | Notes |
|-------|------|-------|
| `sub` | string | User's MongoDB ObjectId — primary identity claim |
| `email` | string | Convenience claim for downstream services |
| `iat` | number | Issued-at (Unix timestamp) — set by `jsonwebtoken` |
| `exp` | number | Expiry (Unix timestamp) — `iat + JWT_ACCESS_EXPIRES_IN` |

**TypeScript representation**:

```typescript
interface AccessTokenPayload {
  sub: string;     // userId
  email: string;
  iat: number;
  exp: number;
}
```

---

## Cross-Service Data Contract (User Service)

The Auth Service reads user identity by calling the User Service's internal endpoint.
The following is the expected response from `POST /api/internal/verify-credentials`:

**Request body** (sent by Auth Service):

```json
{
  "email": "jane@example.com",
  "password": "plaintext-password-from-login-request"
}
```

**Success response** (HTTP 200):

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "jane@example.com"
}
```

**Failure response** (HTTP 401 — wrong credentials):

```json
{
  "error": "invalid_credentials"
}
```

The Auth Service MUST treat any non-200 response from this endpoint as an authentication
failure and return HTTP 401 with a generic message to the client. It MUST NOT forward
the User Service's error body to the caller.

---

## Redis Keyspace Summary

| Key Pattern | Owned By | Purpose | TTL |
|-------------|----------|---------|-----|
| `auth:refresh:{uuid}` | Auth Service | Active refresh token / session | 7 days (configurable) |
| `rl:{ip}:*` | Auth Service (via middleware) | Login rate-limit counter | 15 min window |
| `user:{userId}` | User Service | Profile cache (see 001-user-service) | 5 min (configurable) |

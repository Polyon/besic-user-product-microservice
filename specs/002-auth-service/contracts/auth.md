# API Contract: Authentication Service

**Branch**: `002-auth-service` | **Date**: 2026-05-27  
**Base URL**: `/auth`  
**Source**: [spec.md](../spec.md) | [research.md](../research.md) | [data-model.md](../data-model.md)

---

## Endpoint Index

| Method | Path | Auth Required | Public | Description |
|--------|------|---------------|--------|-------------|
| POST | `/auth/login` | No | **Yes** | Verify credentials; issue token pair |
| POST | `/auth/verify` | Bearer token | No | Validate access token; return identity |
| POST | `/auth/refresh` | Refresh token (body) | No | Exchange refresh token for new access token |
| POST | `/auth/logout` | Refresh token (body) | No | Revoke refresh token |

**Internal endpoint added to User Service** (not owned by Auth Service):

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| POST | `/api/internal/verify-credentials` | `X-Internal-Api-Key` header | Called by Auth Service to verify email + password |

---

## POST `/auth/login`

Verifies a user's email and password by calling the User Service's internal credential
endpoint. On success, issues a short-lived access token and a long-lived refresh token.

**Authentication**: None (public endpoint)  
**Rate limit**: 10 requests per 15 minutes per IP

### Request

```
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "jane@example.com",
  "password": "MySecurePass123"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | Non-empty string |

### Responses

**200 OK — Credentials valid, tokens issued**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "a3f9c2d1-7e4b-4a8f-b1c6-2d3e4f5a6b7c",
  "expiresIn": 900,
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "email": "jane@example.com"
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `accessToken` | string | Signed JWT; valid for `expiresIn` seconds |
| `refreshToken` | string | Opaque UUID v4; valid for 7 days (default) |
| `expiresIn` | number | Access token TTL in seconds |
| `user.id` | string | User's MongoDB ObjectId (from User Service) |
| `user.email` | string | Verified email address |

**400 Bad Request — Validation failure**

```json
{
  "error": "validation_error",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

**401 Unauthorized — Invalid credentials**

```json
{
  "error": "invalid_credentials",
  "message": "Email or password is incorrect"
}
```

> Note: The response is identical whether the email does not exist or the password is
> wrong. This is intentional to prevent user enumeration.

**429 Too Many Requests — Rate limit exceeded**

```json
{
  "error": "too_many_requests",
  "message": "Too many login attempts. Please try again later.",
  "retryAfter": 900
}
```

Headers: `Retry-After: 900`

**503 Service Unavailable — User Service unreachable**

```json
{
  "error": "service_unavailable",
  "message": "Authentication service is temporarily unavailable"
}
```

---

## POST `/auth/verify`

Validates an access token: checks signature and expiry. Returns the identity encoded in
the token. Used by downstream services (via middleware) to authenticate incoming requests.

**Authentication**: `Authorization: Bearer <accessToken>` header  
**Rate limit**: None (internal/trusted usage)

### Request

```
POST /auth/verify
Authorization: Bearer eyJhbGci...
```

No request body required.

### Responses

**200 OK — Token valid**

```json
{
  "userId": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "jane@example.com",
  "expiresAt": "2026-05-27T10:15:00.000Z"
}
```

**401 Unauthorized — Token missing**

```json
{
  "error": "unauthorized",
  "message": "No authentication token provided"
}
```

**401 Unauthorized — Token expired**

```json
{
  "error": "token_expired",
  "message": "Access token has expired"
}
```

**401 Unauthorized — Token invalid**

```json
{
  "error": "invalid_token",
  "message": "Access token is invalid"
}
```

---

## POST `/auth/refresh`

Exchanges a valid refresh token for a new access token. The old refresh token is
immediately invalidated (token rotation). A new refresh token is also issued.

**Authentication**: Refresh token in request body  
**Rate limit**: None

### Request

```
POST /auth/refresh
Content-Type: application/json
```

```json
{
  "refreshToken": "a3f9c2d1-7e4b-4a8f-b1c6-2d3e4f5a6b7c"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `refreshToken` | string | Yes | Non-empty string (UUID v4 format) |

### Responses

**200 OK — New token pair issued**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "b4e0d3e2-8f5c-5b9g-c2d7-3e4f5a6b7c8d",
  "expiresIn": 900
}
```

> The `refreshToken` in the response is a NEW value. The old token is invalidated.

**400 Bad Request — Validation failure**

```json
{
  "error": "validation_error",
  "details": [{ "field": "refreshToken", "message": "Required" }]
}
```

**401 Unauthorized — Refresh token expired, revoked, or unknown**

```json
{
  "error": "invalid_refresh_token",
  "message": "Refresh token is invalid or has expired"
}
```

> Note: Expired tokens (TTL elapsed), revoked tokens (after logout), and replay attempts
> all return the same 401 response. No differentiation is given to the caller.

---

## POST `/auth/logout`

Revokes the supplied refresh token. The user's access token (if any) continues to be
valid until its natural expiry (up to 15 minutes). Subsequent calls with the same refresh
token will be rejected.

**Authentication**: Refresh token in request body  
**Rate limit**: None

### Request

```
POST /auth/logout
Content-Type: application/json
```

```json
{
  "refreshToken": "a3f9c2d1-7e4b-4a8f-b1c6-2d3e4f5a6b7c"
}
```

### Responses

**204 No Content — Logout successful (or token already invalid)**

Empty body. This endpoint is idempotent — logging out an already-expired or
already-revoked token returns 204 without error.

**400 Bad Request — Validation failure**

```json
{
  "error": "validation_error",
  "details": [{ "field": "refreshToken", "message": "Required" }]
}
```

---

## Internal: POST `/api/internal/verify-credentials`

This endpoint is part of the **User Service** (not Auth Service) but is defined here
because the Auth Service depends on it. It must be added to the User Service during
implementation of this feature.

**Authentication**: `X-Internal-Api-Key: <INTERNAL_API_KEY>` header (shared secret)  
**Network exposure**: Internal only (not routed through the public API gateway)  
**Rate limit**: None (called only by Auth Service on the internal network)

### Request

```
POST /api/internal/verify-credentials
Content-Type: application/json
X-Internal-Api-Key: <shared-secret>
```

```json
{
  "email": "jane@example.com",
  "password": "MySecurePass123"
}
```

### Responses

**200 OK — Credentials valid**

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "jane@example.com"
}
```

**401 Unauthorized — Invalid credentials**

```json
{
  "error": "invalid_credentials"
}
```

**401 Unauthorized — Missing or invalid API key**

```json
{
  "error": "unauthorized"
}
```

---

## Error Code Reference

| Code | HTTP Status | When Used |
|------|-------------|-----------|
| `validation_error` | 400 | Request payload fails zod schema validation |
| `unauthorized` | 401 | Missing or invalid API key on internal endpoint |
| `invalid_credentials` | 401 | Email/password do not match |
| `token_expired` | 401 | Access token has passed its `exp` claim |
| `invalid_token` | 401 | Access token signature is invalid or malformed |
| `invalid_refresh_token` | 401 | Refresh token is unknown, expired, or revoked |
| `too_many_requests` | 429 | Login rate limit exceeded |
| `service_unavailable` | 503 | User Service is unreachable during login |

---

## Security Notes

- `POST /auth/login` responses MUST NOT distinguish between "email not found" and
  "wrong password" to prevent user enumeration.
- No sensitive credential data (password, hash, raw tokens) MUST appear in server logs.
- The `X-Internal-Api-Key` header MUST NOT be logged.
- All tokens in logs MUST be redacted to their first 8 characters followed by `***`.

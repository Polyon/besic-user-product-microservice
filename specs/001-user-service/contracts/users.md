# API Contract: User Service

**Branch**: `001-user-service` | **Date**: 2026-05-26  
**Base URL**: `/api/users`  
**Content-Type**: `application/json` (all requests and responses)  
**Auth header**: `Authorization: Bearer <jwt>` (required on protected endpoints)

---

## Public Endpoints (no authentication required)

---

### POST /api/users — Register a New User

**Auth**: None (public)  
**Rate limit**: Yes (`express-rate-limit`)

#### Request Body

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secureP@ssw0rd"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | Yes | 1–100 characters |
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | Minimum 8 characters |

Unknown fields are silently stripped (zod `.strip()` default).

#### Success Response — `201 Created`

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "createdAt": "2026-05-26T10:00:00.000Z",
  "updatedAt": "2026-05-26T10:00:00.000Z"
}
```

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | Missing or malformed field | `"Validation error"` + `details` array |
| `409 Conflict` | Email already registered | `"Email already in use"` |
| `429 Too Many Requests` | Rate limit exceeded | `"Too many requests, please try again later"` |
| `500 Internal Server Error` | Unexpected server error | `"Internal server error"` |

---

## Protected Endpoints (JWT required)

All protected endpoints require the header:  
`Authorization: Bearer <valid-unexpired-jwt>`

If the token is absent, malformed, or expired, all protected endpoints return:  
`401 Unauthorized` → `{ "error": "Unauthorised" }`

If the authenticated user attempts to access another user's resource:  
`403 Forbidden` → `{ "error": "Forbidden" }`

---

### GET /api/users/:id — Get Own Profile

**Auth**: Bearer JWT (required)  
**Scope**: User may only retrieve their own profile (`id` in path must match `userId` in token)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the user |

#### Success Response — `200 OK`

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "createdAt": "2026-05-26T10:00:00.000Z",
  "updatedAt": "2026-05-26T10:00:00.000Z"
}
```

**Cache behaviour**: Response is served from Redis cache if available (`user:{id}` key).
On cache miss, MongoDB is queried and the result is written to cache.

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `403 Forbidden` | Token userId ≠ path id | `"Forbidden"` |
| `404 Not Found` | User id does not exist | `"User not found"` |
| `500 Internal Server Error` | Unexpected error | `"Internal server error"` |

---

### PATCH /api/users/:id — Update Own Profile

**Auth**: Bearer JWT (required)  
**Scope**: User may only update their own profile (`id` in path must match `userId` in token)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the user |

#### Request Body

At least one field must be provided. All fields are optional individually.

```json
{
  "name": "Jane Smith",
  "email": "jane.smith@example.com",
  "password": "newSecureP@ss1"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | No (at least one required) | 1–100 characters |
| `email` | string | No (at least one required) | Valid email format |
| `password` | string | No (at least one required) | Minimum 8 characters |

#### Success Response — `200 OK`

Returns the updated public user object (same shape as GET response).

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Jane Smith",
  "email": "jane.smith@example.com",
  "createdAt": "2026-05-26T10:00:00.000Z",
  "updatedAt": "2026-05-26T11:30:00.000Z"
}
```

**Cache behaviour**: `user:{id}` key is deleted from Redis immediately after successful
MongoDB write. Subsequent GET will repopulate the cache.

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | Empty body or no recognised fields | `"At least one field must be provided"` |
| `400 Bad Request` | Field validation failure | `"Validation error"` + `details` array |
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `403 Forbidden` | Token userId ≠ path id | `"Forbidden"` |
| `404 Not Found` | User id does not exist | `"User not found"` |
| `409 Conflict` | New email already belongs to another account | `"Email already in use"` |
| `500 Internal Server Error` | Unexpected error | `"Internal server error"` |

---

### DELETE /api/users/:id — Delete Own Account

**Auth**: Bearer JWT (required)  
**Scope**: User may only delete their own account (`id` in path must match `userId` in token)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the user |

#### Success Response — `200 OK`

```json
{
  "message": "Account deleted successfully"
}
```

**Cache behaviour**: `user:{id}` key is deleted from Redis immediately after successful
MongoDB deletion.

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `403 Forbidden` | Token userId ≠ path id | `"Forbidden"` |
| `404 Not Found` | User id does not exist | `"User not found"` |
| `500 Internal Server Error` | Unexpected error | `"Internal server error"` |

---

## Standard Error Response Shape

All error responses follow this envelope:

```json
{
  "error": "Human-readable error message",
  "details": ["Optional array of field-level validation messages"]
}
```

- `details` is only present on `400 Bad Request` validation errors.
- Internal error details (stack traces, MongoDB messages) MUST NOT appear in responses.

---

## Endpoint Summary

| Method | Path | Auth | Public |
|--------|------|------|--------|
| POST | `/api/users` | None | ✅ Yes |
| GET | `/api/users/:id` | Bearer JWT | ❌ No |
| PATCH | `/api/users/:id` | Bearer JWT | ❌ No |
| DELETE | `/api/users/:id` | Bearer JWT | ❌ No |

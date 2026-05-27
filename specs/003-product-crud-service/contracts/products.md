# API Contract: Product Service

**Branch**: `003-product-crud-service` | **Date**: 2026-05-27  
**Base URL**: `/api/products`  
**Content-Type**: `application/json` (all requests and responses)  
**Auth header**: `Authorization: Bearer <jwt>` (required on ALL endpoints)

---

## Authentication

All endpoints in this service require a valid JWT issued by the Auth Service.  
Tokens are verified via shared HS256 secret (`JWT_SECRET` environment variable).

**If the token is absent, malformed, or expired**, all endpoints return:

```json
HTTP 401 Unauthorized
{ "error": "Unauthorised" }
```

---

## Protected Endpoints (JWT required on all)

---

### GET /api/products — List Products (Paginated)

**Auth**: Bearer JWT (required)  
**Rate limit**: Yes (`express-rate-limit`)

#### Query Parameters

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `page` | number (integer) | No | `1` | ≥ 1 |
| `limit` | number (integer) | No | `20` | 1–100 |

#### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "664f1a2b3c4d5e6f7a8b9c0d",
      "name": "Wireless Keyboard",
      "description": "Compact 75% layout, RGB backlit",
      "price": 79.99,
      "category": "Electronics",
      "stock": 150,
      "createdAt": "2026-05-27T10:00:00.000Z",
      "updatedAt": "2026-05-27T10:00:00.000Z"
    }
  ],
  "total": 420,
  "page": 1,
  "limit": 20,
  "totalPages": 21
}
```

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | Invalid query params (e.g., `page=0`) | `"Validation error"` + `details` array |
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `429 Too Many Requests` | Rate limit exceeded | `"Too many requests, please try again later"` |
| `500 Internal Server Error` | Unexpected server error | `"Internal server error"` |

---

### GET /api/products/:id — Get Product by ID

**Auth**: Bearer JWT (required)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (MongoDB ObjectId, 24 hex chars) | Unique product identifier |

#### Success Response — `200 OK`

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Wireless Keyboard",
  "description": "Compact 75% layout, RGB backlit",
  "price": 79.99,
  "category": "Electronics",
  "stock": 150,
  "createdAt": "2026-05-27T10:00:00.000Z",
  "updatedAt": "2026-05-27T10:00:00.000Z"
}
```

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | `id` is not a valid ObjectId | `"Validation error"` + `details` array |
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `404 Not Found` | No product with this ID exists | `"Product not found"` |
| `500 Internal Server Error` | Unexpected server error | `"Internal server error"` |

---

### POST /api/products — Create a Product

**Auth**: Bearer JWT (required)  
**Rate limit**: Yes (`express-rate-limit`)

#### Request Body

```json
{
  "name": "Wireless Keyboard",
  "description": "Compact 75% layout, RGB backlit",
  "price": 79.99,
  "category": "Electronics",
  "stock": 150
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | Yes | 1–200 characters |
| `description` | string | No | max 2000 characters |
| `price` | number | Yes | > 0 |
| `category` | string | Yes | 1–100 characters |
| `stock` | number (integer) | Yes | ≥ 0 |

Unknown fields are silently stripped (zod `.strip()` default).

#### Success Response — `201 Created`

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Wireless Keyboard",
  "description": "Compact 75% layout, RGB backlit",
  "price": 79.99,
  "category": "Electronics",
  "stock": 150,
  "createdAt": "2026-05-27T10:00:00.000Z",
  "updatedAt": "2026-05-27T10:00:00.000Z"
}
```

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | Missing required field or invalid value | `"Validation error"` + `details` array |
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `429 Too Many Requests` | Rate limit exceeded | `"Too many requests, please try again later"` |
| `500 Internal Server Error` | Unexpected server error | `"Internal server error"` |

---

### PATCH /api/products/:id — Update a Product (Partial)

**Auth**: Bearer JWT (required)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (MongoDB ObjectId, 24 hex chars) | Unique product identifier |

#### Request Body

All fields are optional. At least one field must be provided.

```json
{
  "price": 69.99,
  "stock": 200
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | No | 1–200 characters |
| `description` | string | No | max 2000 characters |
| `price` | number | No | > 0 |
| `category` | string | No | 1–100 characters |
| `stock` | number (integer) | No | ≥ 0 |

#### Success Response — `200 OK`

Returns the full updated product object:

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Wireless Keyboard",
  "description": "Compact 75% layout, RGB backlit",
  "price": 69.99,
  "category": "Electronics",
  "stock": 200,
  "createdAt": "2026-05-27T10:00:00.000Z",
  "updatedAt": "2026-05-27T11:30:00.000Z"
}
```

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | Invalid `id`, invalid field value, or empty body | `"Validation error"` + `details` array |
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `404 Not Found` | No product with this ID exists | `"Product not found"` |
| `500 Internal Server Error` | Unexpected server error | `"Internal server error"` |

---

### DELETE /api/products/:id — Delete a Product

**Auth**: Bearer JWT (required)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (MongoDB ObjectId, 24 hex chars) | Unique product identifier |

#### Success Response — `200 OK`

```json
{
  "message": "Product deleted successfully"
}
```

#### Error Responses

| HTTP Status | Condition | Body `error` field |
|-------------|-----------|--------------------|
| `400 Bad Request` | `id` is not a valid ObjectId | `"Validation error"` + `details` array |
| `401 Unauthorized` | Missing/invalid/expired token | `"Unauthorised"` |
| `404 Not Found` | No product with this ID exists | `"Product not found"` |
| `500 Internal Server Error` | Unexpected server error | `"Internal server error"` |

---

## Standard Error Response Shape

All error responses follow this envelope:

```json
{
  "error": "<human-readable message>",
  "details": [ /* optional: array of field-level validation errors */ ]
}
```

`details` is omitted on non-validation errors (401, 404, 500). When present, each element
follows the zod `.flatten()` format:

```json
{
  "details": [
    { "field": "price", "message": "Number must be greater than 0" },
    { "field": "stock", "message": "Number must be greater than or equal to 0" }
  ]
}
```

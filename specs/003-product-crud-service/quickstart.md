# Quickstart: Product CRUD Service

**Branch**: `003-product-crud-service` | **Date**: 2026-05-27  
**Prerequisites**: Docker Desktop, Node.js ≥ 20 LTS, npm or pnpm

---

## 1. Clone and Navigate

```bash
git clone <repo-url>
cd <repo-root>
git checkout 003-product-crud-service
cd services/product-service
```

---

## 2. Install Dependencies

```bash
npm install
# or
pnpm install
```

---

## 3. Configure Environment

Copy the example env file and fill in the required values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Server
PORT=3003
NODE_ENV=development

# MongoDB — use the docker-compose service name when running in Docker
MONGODB_URI=mongodb://localhost:27017/product-service-db

# JWT — must match the secret used by the Authentication Service
JWT_SECRET=change-me-to-a-256-bit-random-secret

# Redis — used for rate-limiting counters
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug
```

> **Never commit `.env` to version control.** Only `.env.example` (with placeholder values) is committed.

---

## 4. Start Infrastructure with Docker Compose

From the **repository root** (not the service directory):

```bash
docker compose up -d mongodb redis
```

This starts MongoDB and Redis in the background. The `docker-compose.yml` at the
repository root defines all shared infrastructure for local development.

> **Note**: The Product Service uses its own MongoDB database (`product-service-db`).
> It does NOT share a database with the User Service or Auth Service.

---

## 5. Run the Service (development mode)

```bash
npm run dev
# or with ts-node directly
npx ts-node server.ts
```

The service starts on `http://localhost:3003`.

---

## 6. Run Tests

### Unit tests only

```bash
npm test -- --testPathPattern="unit"
```

### All tests (unit + integration + contract)

```bash
npm test
```

Integration and contract tests use `mongodb-memory-server` (in-memory MongoDB) and
`ioredis-mock` — no running infrastructure is required.

### Coverage report

```bash
npm test -- --coverage
```

Minimum gate: **80% line coverage** (enforced in CI).

---

## 7. Verify the Service is Running

### Obtain a JWT from the Auth Service

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "yourpassword"}'
```

Copy the `accessToken` from the response.

### Create a product

```bash
curl -X POST http://localhost:3003/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "Wireless Keyboard",
    "description": "Compact 75% layout, RGB backlit",
    "price": 79.99,
    "category": "Electronics",
    "stock": 150
  }'
```

### List products

```bash
curl http://localhost:3003/api/products \
  -H "Authorization: Bearer <accessToken>"
```

### Get a product by ID

```bash
curl http://localhost:3003/api/products/<productId> \
  -H "Authorization: Bearer <accessToken>"
```

### Update a product

```bash
curl -X PATCH http://localhost:3003/api/products/<productId> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"price": 69.99, "stock": 200}'
```

### Delete a product

```bash
curl -X DELETE http://localhost:3003/api/products/<productId> \
  -H "Authorization: Bearer <accessToken>"
```

---

## 8. Run with Docker

### Build the image

```bash
docker build -t product-service .
```

### Run the full stack (all services)

From the **repository root**:

```bash
docker compose up --build
```

This starts the Product Service alongside MongoDB, Redis, User Service, and Auth Service
as defined in `docker-compose.yml`.

---

## Key Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | HTTP port for the service | `3003` |
| `NODE_ENV` | No | Runtime environment (`development`/`production`/`test`) | `development` |
| `MONGODB_URI` | **Yes** | MongoDB connection string | — |
| `JWT_SECRET` | **Yes** | HS256 secret shared with Auth Service (≥ 256 bits) | — |
| `REDIS_URL` | **Yes** | Redis connection URL | — |
| `LOG_LEVEL` | No | Logging verbosity (`debug`/`info`/`warn`/`error`) | `info` |

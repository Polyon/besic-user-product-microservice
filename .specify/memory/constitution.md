<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0  (MINOR — new Technology Stack section added)
Modified principles: None
Added sections:
  - Technology Stack (language, runtime, frameworks, persistence, caching, tooling)
Removed sections: None
Templates reviewed:
  - .specify/templates/plan-template.md   ✅ compatible (Technical Context section maps directly to stack)
  - .specify/templates/spec-template.md   ✅ compatible (no changes needed)
  - .specify/templates/tasks-template.md  ✅ compatible (Phase 1 Setup tasks reference stack)
  - .specify/templates/constitution-template.md ✅ source template, no changes needed
Deferred TODOs: None.
-->

# Microservice Project Constitution

## Core Principles

### I. Authentication-First (NON-NEGOTIABLE)

Every request to a protected endpoint MUST be accompanied by a valid authentication token
issued by the Authentication Service. Services MUST verify the token before executing any
protected operation. The Authentication Service is the sole authority for token issuance
and validation; no service MUST bypass or replicate this responsibility.

**Protected operations** (authentication REQUIRED):
- User Service: GET user, UPDATE user, DELETE user
- Product Service: ALL operations (create, read, update, delete)

**Public operations** (authentication NOT required):
- User Service: POST /users (registration)
- Authentication Service: POST /auth/login

**Rationale**: Unauthenticated access to user data or product data is a security violation.
Centralising auth in a single service ensures a consistent, auditable trust boundary.

### II. Service Independence

Each microservice (User Service, Authentication Service, Product Service) MUST be
independently deployable, independently testable, and independently scalable.

- Services MUST NOT share databases or internal data stores.
- Services MUST communicate only through well-defined API contracts (REST or equivalent).
- No service MUST import or directly invoke another service's internal code.
- Each service MUST own its own data model and persistence layer.

**Rationale**: Tight coupling defeats the purpose of a microservice architecture and makes
independent scaling, fault isolation, and team ownership impossible.

### III. Minimal Public Surface

Public (unauthenticated) endpoints MUST be explicitly declared and kept to the minimum
necessary for the system to function. All endpoints are considered protected by default;
a deliberate, documented decision is required to mark any endpoint public.

- Current public endpoints MUST be documented in each service's API contract.
- Adding a new public endpoint MUST require a constitution amendment or explicit written
  justification in the feature specification.

**Rationale**: An unexpectedly public endpoint is a security vulnerability. Explicit
enumeration prevents accidental exposure of sensitive operations.

### IV. Test-First Development (NON-NEGOTIABLE)

Tests MUST be written and reviewed before implementation begins.
The Red-Green-Refactor cycle is strictly enforced:

1. Write a failing test that describes the desired behaviour.
2. Confirm the test fails for the right reason.
3. Implement the minimum code to make the test pass.
4. Refactor while keeping tests green.

Integration and contract tests MUST cover every cross-service authentication flow.
A feature MUST NOT be merged without passing unit, contract, and integration tests.

**Rationale**: Test-first discipline prevents regressions in auth enforcement and ensures
all inter-service contracts are verified before code ships.

### V. Simplicity & YAGNI

Implement only what is required to satisfy the stated requirements — no more.

- Services MUST start with the simplest design that passes all acceptance criteria.
- Premature optimisation, speculative features, and unnecessary abstractions are prohibited.
- Complexity MUST be justified in writing before introduction.

**Rationale**: A simple codebase is easier to secure, maintain, and reason about.
Microservices magnify complexity; restraint at each service boundary contains it.

## Technology Stack

All services MUST be built using the following canonical stack. Deviations require a
constitution amendment with written justification.

### Runtime & Language

- **Runtime**: Node.js (LTS release, ≥ 20.x)
- **Language**: TypeScript (strict mode MUST be enabled — `"strict": true` in `tsconfig.json`)
- All source files MUST be `.ts`; compiled output MUST NOT be committed to version control.

### Web Framework

- **Framework**: Express.js
- Each service exposes a RESTful HTTP API built on Express.
- Route handlers MUST be thin; business logic MUST live in a dedicated service/use-case layer.
- Request validation MUST use a schema validation library (e.g., `zod` or `joi`) — raw
  `req.body` MUST NOT be trusted without validation.

### Primary Persistence

- **Database**: MongoDB (via `mongoose` ODM)
- Each microservice owns its own MongoDB database; cross-service DB access is prohibited
  (aligns with Principle II — Service Independence).
- Mongoose schemas MUST enforce type definitions consistent with the TypeScript models.
- Database connection strings MUST be sourced from environment variables; no hard-coded
  credentials anywhere in source code.

### Caching & Session Store

- **Cache**: Redis (via `ioredis`)
- Redis MUST be used for:
  - JWT token invalidation / revocation lists (managed by the Authentication Service).
  - Short-lived session data and rate-limiting counters.
- Redis MUST NOT be used as a primary data store for business entities.
- Redis connection details MUST be sourced from environment variables.

### Authentication & Security Libraries

- **JWT**: `jsonwebtoken` for token signing and verification.
- **Password hashing**: `bcrypt` (cost factor ≥ 12); `argon2` is an accepted alternative.
- **Environment config**: `dotenv` (local dev only) — production config via container/cloud
  environment variables.
- **CORS**: `cors` middleware, configured explicitly per service (no wildcard `*` in
  non-development environments).
- **Rate limiting**: `express-rate-limit` MUST be applied to all public endpoints.

### Testing

- **Test runner**: Jest with `ts-jest` transformer.
- **HTTP assertions**: Supertest for integration and contract tests.
- **Mocking**: Jest built-in mocks; `mongodb-memory-server` for in-memory MongoDB in tests.
- **Redis mocking**: `ioredis-mock` for unit/integration tests.
- Minimum coverage gate: 80% line coverage enforced in CI.

### Code Quality & Tooling

- **Linter**: ESLint with `@typescript-eslint` plugin (no warnings permitted in CI).
- **Formatter**: Prettier (config committed to repo; enforced in CI).
- **Build**: `tsc` (TypeScript compiler); no bundler required for server-side services.
- **Containerisation**: Each service MUST include a `Dockerfile` using a Node LTS base image.
- **Orchestration**: `docker-compose.yml` at the repository root for local development
  (all services + MongoDB + Redis).
- **Package manager**: npm or pnpm (one MUST be chosen and used consistently across all
  services — do not mix).

## Security Requirements

All services MUST adhere to the following security constraints without exception:

- **Password storage**: User passwords MUST be hashed with bcrypt (cost factor ≥ 12)
  or argon2id before persistence. Plaintext passwords MUST never be stored or logged.
- **Token format**: Authentication tokens MUST use JWT (JSON Web Tokens) signed with
  a strong algorithm (RS256 or HS256 with a secret of ≥ 256 bits).
- **Token expiry**: Every issued token MUST carry an expiry (`exp` claim).
  Expired tokens MUST be rejected with HTTP 401 Unauthorized.
- **Token validation**: Each protected service MUST validate the token signature and
  expiry on every incoming request before processing business logic.
- **Input validation**: All external inputs (request bodies, path parameters, query
  strings) MUST be validated and sanitised at service boundaries.
- **Error responses**: Services MUST NOT expose internal error details (stack traces,
  SQL errors) in API responses. Return generic error messages to clients.
- **Transport security**: All inter-service and client-to-service communication MUST
  use HTTPS/TLS in non-local environments.

## Development Workflow

- **API-contract-first**: The API contract (endpoints, request/response schemas, auth
  requirements) for each service MUST be defined and reviewed before any implementation
  begins. Contracts are the source of truth for integration.
- **Feature branching**: All work MUST occur on a feature branch. Direct commits to
  `main` are prohibited.
- **Pull request gates**: Every PR MUST pass automated tests (unit + integration +
  contract) and receive at least one peer review before merge.
- **Dependency management**: External dependencies MUST be pinned to specific versions
  and reviewed for known vulnerabilities before adoption.
- **Observability**: Every service MUST emit structured logs for all protected-endpoint
  access attempts (success and failure) to support security auditing.

## Governance

This constitution supersedes all other project practices and guidelines. In the event
of conflict between this document and any other artifact, the constitution prevails.

**Amendment procedure**:
1. Open a pull request that modifies `.specify/memory/constitution.md`.
2. Increment the version following semantic versioning rules defined in this document.
3. Include a written rationale for the change and list all affected artifacts.
4. Obtain approval from at least one other project maintainer.
5. Update all dependent templates and documentation in the same pull request.

**Versioning policy**:
- MAJOR: Removal or redefinition of a principle, or removal of a protected endpoint class.
- MINOR: New principle, new section, or material expansion of an existing principle.
- PATCH: Clarifications, wording fixes, typo corrections, non-semantic refinements.

**Compliance review**: All PRs and design documents MUST include a "Constitution Check"
section that explicitly verifies compliance with each Core Principle and Security
Requirement before the work is approved.

**Version**: 1.1.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-26
